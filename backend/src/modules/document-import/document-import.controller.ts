import {
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { MAX_DOCUMENT_FILE_SIZE_BYTES } from './document-parser.util.js';
import {
  DocumentImportService,
  type UploadedMulterDocument,
} from './document-import.service.js';

@ApiTags('Invoice & Bill Document Import Pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard, RateLimitGuard)
@Controller({ path: 'organizations/:orgId', version: '1' })
export class DocumentImportController {
  constructor(private readonly service: DocumentImportService) {}

  @Post('invoices/import/extract')
  @RateLimit({ windowMs: 60_000, maxRequests: 20 })
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Customer invoice document (PDF, JPG, JPEG, or PNG; max 10 MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload and extract customer invoice fields/line items from PDF/JPG/JPEG/PNG without auto-saving or mutating ledger/account balances',
  })
  async extractCustomerInvoice(
    @Param('orgId') orgId: string,
    @UploadedFile() file: UploadedMulterDocument | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.extractDocument(orgId, 'INVOICE', file, user);
  }

  @Post('bills/import/extract')
  @RateLimit({ windowMs: 60_000, maxRequests: 20 })
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Supplier bill document (PDF, JPG, JPEG, or PNG; max 10 MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload and extract supplier bill fields/line items from PDF/JPG/JPEG/PNG without auto-saving or mutating ledger/account balances',
  })
  async extractSupplierBill(
    @Param('orgId') orgId: string,
    @UploadedFile() file: UploadedMulterDocument | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.extractDocument(orgId, 'BILL', file, user);
  }
}
