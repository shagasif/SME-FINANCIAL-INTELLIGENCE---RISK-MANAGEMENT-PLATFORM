import { Module } from '@nestjs/common';
import { CsvImportController } from './csv-import.controller.js';
import { CsvImportService } from './csv-import.service.js';

@Module({
  controllers: [CsvImportController],
  providers: [CsvImportService],
  exports: [CsvImportService],
})
export class CsvImportModule {}
