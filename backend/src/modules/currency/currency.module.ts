import { Global, Module } from '@nestjs/common';
import { CurrencyController } from './currency.controller.js';
import { CurrencyConversionService } from './currency.service.js';

@Global()
@Module({
  controllers: [CurrencyController],
  providers: [CurrencyConversionService],
  exports: [CurrencyConversionService],
})
export class CurrencyModule {}
