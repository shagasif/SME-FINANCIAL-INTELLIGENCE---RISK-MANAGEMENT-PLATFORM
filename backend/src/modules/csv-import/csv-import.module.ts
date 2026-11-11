import { Module } from '@nestjs/common';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module.js';
import { CsvImportController } from './csv-import.controller.js';
import { CsvImportService } from './csv-import.service.js';

@Module({
  imports: [AiOrchestrationModule],
  controllers: [CsvImportController],
  providers: [CsvImportService],
  exports: [CsvImportService],
})
export class CsvImportModule {}
