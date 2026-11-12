import { Module } from '@nestjs/common';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module.js';
import { DocumentImportController } from './document-import.controller.js';
import { DocumentImportService } from './document-import.service.js';

@Module({
  imports: [AiOrchestrationModule],
  controllers: [DocumentImportController],
  providers: [DocumentImportService],
  exports: [DocumentImportService],
})
export class DocumentImportModule {}
