import { Module } from '@nestjs/common';
import { FinancialTransactionsController } from './financial-transactions.controller.js';
import { FinancialTransactionsService } from './financial-transactions.service.js';

@Module({
  controllers: [FinancialTransactionsController],
  providers: [FinancialTransactionsService],
  exports: [FinancialTransactionsService],
})
export class FinancialTransactionsModule {}
