import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { BcvScraperService } from './bcv-scraper.service';

@Module({
  providers: [ExchangeRateService, BcvScraperService],
  exports: [ExchangeRateService, BcvScraperService],
})
export class ExchangeRateModule {}
