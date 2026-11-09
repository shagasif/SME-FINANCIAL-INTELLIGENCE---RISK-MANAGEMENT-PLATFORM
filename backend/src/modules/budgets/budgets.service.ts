import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateBudgetDto, ReviseBudgetDto } from './dto/budget.dto.js';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createBudget(organizationId: string, dto: CreateBudgetDto, actorUserId: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('Budget endDate must be after startDate');
    }

    const totalAllocated = DecimalMath.sum(dto.lines.map((l) => l.allocatedAmount));
    if (totalAllocated.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Total allocated budget must be strictly greater than zero');
    }

    const budget = await this.prisma.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          periodType: dto.periodType,
          startDate,
          endDate,
          currency: (dto.currency ?? 'USD').toUpperCase(),
          totalAllocated,
          version: 1,
          notes: dto.notes ?? null,
          createdById: actorUserId,
          lines: {
            create: dto.lines.map((line) => ({
              category: line.category.trim(),
              department: (line.department ?? 'General').trim(),
              allocatedAmount: DecimalMath.of(line.allocatedAmount),
              alertThreshold: DecimalMath.of(line.alertThreshold ?? '90.0000'),
              notes: line.notes ?? null,
            })),
          },
        },
        include: { lines: true, revisions: true },
      });

      await tx.budgetRevision.create({
        data: {
          budgetId: created.id,
          version: 1,
          previousAllocated: DecimalMath.ZERO,
          newAllocated: totalAllocated,
          changeSummary: 'Initial budget creation',
          snapshotLines: dto.lines as unknown as Prisma.InputJsonValue,
          revisedByUserId: actorUserId,
        },
      });

      return tx.budget.findUniqueOrThrow({
        where: { id: created.id },
        include: { lines: true, revisions: true },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'BUDGET_CREATED',
      resourceType: 'BUDGET',
      resourceId: budget.id,
      details: {
        name: budget.name,
        periodType: budget.periodType,
        totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      },
    });

    return this.serializeBudget(budget);
  }

  async reviseBudget(
    organizationId: string,
    budgetId: string,
    dto: ReviseBudgetDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.budget.findFirst({
      where: { id: budgetId, organizationId },
      include: { lines: true },
    });
    if (!existing) {
      throw new NotFoundException('Budget not found in organization');
    }

    const newAllocated = DecimalMath.sum(dto.lines.map((l) => l.allocatedAmount));
    const nextVersion = existing.version + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({ where: { budgetId } });

      await tx.budgetLine.createMany({
        data: dto.lines.map((l) => ({
          budgetId,
          category: l.category.trim(),
          department: (l.department ?? 'General').trim(),
          allocatedAmount: DecimalMath.of(l.allocatedAmount),
          alertThreshold: DecimalMath.of(l.alertThreshold ?? '90.0000'),
          notes: l.notes ?? null,
        })),
      });

      await tx.budgetRevision.create({
        data: {
          budgetId,
          version: nextVersion,
          previousAllocated: existing.totalAllocated,
          newAllocated,
          changeSummary: dto.changeSummary.trim(),
          snapshotLines: dto.lines as unknown as Prisma.InputJsonValue,
          revisedByUserId: actorUserId,
        },
      });

      return tx.budget.update({
        where: { id: budgetId },
        data: {
          totalAllocated: newAllocated,
          version: nextVersion,
        },
        include: {
          lines: true,
          revisions: { orderBy: { version: 'desc' } },
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'BUDGET_REVISED',
      resourceType: 'BUDGET',
      resourceId: budgetId,
      details: {
        version: nextVersion,
        previousAllocated: DecimalMath.toFixed4(existing.totalAllocated),
        newAllocated: DecimalMath.toFixed4(newAllocated),
        changeSummary: dto.changeSummary,
      },
    });

    return this.serializeBudget(updated);
  }

  async listBudgets(organizationId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { organizationId },
      include: {
        lines: true,
        revisions: { orderBy: { version: 'desc' } },
      },
      orderBy: { startDate: 'desc' },
    });
    return budgets.map((b) => this.serializeBudget(b));
  }

  async calculateBudgetVariance(organizationId: string, budgetId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, organizationId },
      include: {
        lines: true,
        revisions: { orderBy: { version: 'desc' } },
      },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found in organization');
    }

    const expenses = await this.prisma.financialTransaction.findMany({
      where: {
        organizationId,
        isArchived: false,
        type: TransactionType.EXPENSE,
        transactionDate: {
          gte: budget.startDate,
          lte: budget.endDate,
        },
      },
    });

    const lineVariances = budget.lines.map((line) => {
      const matchingTxs = expenses.filter((tx) => {
        const catMatch = tx.category.toLowerCase() === line.category.toLowerCase();
        if (!catMatch) return false;
        if (line.department && line.department.toLowerCase() !== 'general' && tx.department) {
          return tx.department.toLowerCase() === line.department.toLowerCase();
        }
        return true;
      });

      const actualSpent = DecimalMath.sum(matchingTxs.map((t) => t.amount));
      const varianceAmount = DecimalMath.sub(line.allocatedAmount, actualSpent); // Positive = under budget, Negative = overrun
      const utilizationPct =
        DecimalMath.percentage(actualSpent, line.allocatedAmount) ?? DecimalMath.ZERO;
      const variancePct =
        DecimalMath.percentage(varianceAmount, line.allocatedAmount) ?? DecimalMath.ZERO;

      const isOverBudget = actualSpent.gt(line.allocatedAmount);
      const isNearThreshold = !isOverBudget && utilizationPct.gte(line.alertThreshold);

      return {
        lineId: line.id,
        category: line.category,
        department: line.department,
        allocatedAmount: DecimalMath.toFixed4(line.allocatedAmount),
        actualSpent: DecimalMath.toFixed4(actualSpent),
        varianceAmount: DecimalMath.toFixed4(varianceAmount),
        utilizationPct: DecimalMath.toFixed4(utilizationPct),
        variancePct: DecimalMath.toFixed4(variancePct),
        alertThresholdPct: DecimalMath.toFixed4(line.alertThreshold),
        status: isOverBudget ? 'OVERRUN' : isNearThreshold ? 'WARNING' : 'ON_TRACK',
        sourceTransactionIds: matchingTxs.map((t) => t.id),
      };
    });

    const totalActualSpent = DecimalMath.sum(lineVariances.map((l) => l.actualSpent));
    const totalVarianceAmount = DecimalMath.sub(budget.totalAllocated, totalActualSpent);
    const totalUtilizationPct =
      DecimalMath.percentage(totalActualSpent, budget.totalAllocated) ?? DecimalMath.ZERO;
    const totalVariancePct =
      DecimalMath.percentage(totalVarianceAmount, budget.totalAllocated) ?? DecimalMath.ZERO;

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      version: budget.version,
      periodType: budget.periodType,
      periodStart: budget.startDate.toISOString(),
      periodEnd: budget.endDate.toISOString(),
      currency: budget.currency,
      formula:
        'VarianceAmount = AllocatedAmount - ActualSpent; UtilizationPct = (ActualSpent / AllocatedAmount) * 100',
      totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      totalActualSpent: DecimalMath.toFixed4(totalActualSpent),
      totalVarianceAmount: DecimalMath.toFixed4(totalVarianceAmount),
      totalUtilizationPct: DecimalMath.toFixed4(totalUtilizationPct),
      totalVariancePct: DecimalMath.toFixed4(totalVariancePct),
      isOverBudget: totalActualSpent.gt(budget.totalAllocated),
      lines: lineVariances,
      revisions: budget.revisions.map((r) => ({
        id: r.id,
        version: r.version,
        previousAllocated: DecimalMath.toFixed4(r.previousAllocated),
        newAllocated: DecimalMath.toFixed4(r.newAllocated),
        changeSummary: r.changeSummary,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private serializeBudget(budget: {
    id: string;
    organizationId: string;
    name: string;
    periodType: string;
    startDate: Date;
    endDate: Date;
    currency: string;
    totalAllocated: Prisma.Decimal;
    status: string;
    version: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    lines?: Array<{
      id: string;
      category: string;
      department: string;
      allocatedAmount: Prisma.Decimal;
      alertThreshold: Prisma.Decimal;
      notes: string | null;
    }>;
    revisions?: Array<{
      id: string;
      version: number;
      previousAllocated: Prisma.Decimal;
      newAllocated: Prisma.Decimal;
      changeSummary: string;
      createdAt: Date;
    }>;
  }) {
    return {
      ...budget,
      totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      startDate: budget.startDate.toISOString(),
      endDate: budget.endDate.toISOString(),
      lines: budget.lines?.map((l) => ({
        ...l,
        allocatedAmount: DecimalMath.toFixed4(l.allocatedAmount),
        alertThreshold: DecimalMath.toFixed4(l.alertThreshold),
      })),
      revisions: budget.revisions?.map((r) => ({
        ...r,
        previousAllocated: DecimalMath.toFixed4(r.previousAllocated),
        newAllocated: DecimalMath.toFixed4(r.newAllocated),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
