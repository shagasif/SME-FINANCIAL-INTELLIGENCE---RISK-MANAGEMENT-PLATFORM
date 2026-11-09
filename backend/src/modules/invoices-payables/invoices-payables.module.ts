import { Module } from '@nestjs/common';
import { InvoicesPayablesController } from './invoices-payables.controller.js';
import { InvoicesPayablesService } from './invoices-payables.service.js';

@Module({
  controllers: [InvoicesPayablesController],
  providers: [InvoicesPayablesService],
  exports: [InvoicesPayablesService],
})
export class InvoicesPayablesModule {}
