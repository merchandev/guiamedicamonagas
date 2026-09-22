import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SubscriptionsService } from './subscriptions.service';
import { UpsertPlanDto } from './dto/upsert-plan.dto';
import { UpdateExchangeRateDto } from './dto/exchange-rate.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('plans')
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Public()
  @Get('exchange-rate')
  getExchangeRate() {
    return this.subscriptions.getExchangeRate();
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put('admin/exchange-rate')
  updateExchangeRate(@Body() dto: UpdateExchangeRateDto) {
    return this.subscriptions.updateExchangeRate(dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('admin/exchange-rate/sync-bcv')
  syncExchangeRateFromBcv() {
    return this.subscriptions.syncExchangeRateFromBcv();
  }

  @Roles(Role.PROFESSIONAL)
  @Get('me')
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.getOwnSubscription(user.id);
  }

  @Roles(Role.PROFESSIONAL)
  @Post('me')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body('planId') planId: string) {
    return this.subscriptions.subscribe(user.id, planId);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/plans')
  adminListPlans() {
    return this.subscriptions.adminListPlans();
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('admin/plans')
  createPlan(@Body() dto: UpsertPlanDto) {
    return this.subscriptions.createPlan(dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Put('admin/plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpsertPlanDto) {
    return this.subscriptions.updatePlan(id, dto);
  }

  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Patch('admin/plans/:id/deactivate')
  deactivatePlan(@Param('id') id: string) {
    return this.subscriptions.deactivatePlan(id);
  }
}
