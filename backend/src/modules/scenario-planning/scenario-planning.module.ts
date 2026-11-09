import { Module } from '@nestjs/common';
import { ScenarioPlanningController } from './scenario-planning.controller.js';
import { ScenarioPlanningService } from './scenario-planning.service.js';

@Module({
  controllers: [ScenarioPlanningController],
  providers: [ScenarioPlanningService],
  exports: [ScenarioPlanningService],
})
export class ScenarioPlanningModule {}
