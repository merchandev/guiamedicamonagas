import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AssignPaidPlanDto } from './dto/assign-paid-plan.dto';
import { AdminPlanAssignmentsService } from './admin-plan-assignments.service';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SubscriptionsService } from './subscriptions.service';
import { UpsertPlanDto } from './dto/upsert-plan.dto';
import { UpdateExchangeRateDto } from './dto/exchange-rate.dto';
import { Permission, RequirePermissions } from '../common/permissions';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService, private readonly assignments: AdminPlanAssignmentsService) {}

  @RequirePermissions(Permission.ASSIGN_PAID_PLANS, Permission.REVIEW_PAYMENTS)
  @Post('admin/professionals/:id/assign-paid-plan')
  assignPaidPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignPaidPlanDto,
    @CurrentUser() actor: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.assignments.assign(id, dto, actor.id, req.ip);
  }

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

  @RequirePermissions(Permission.MANAGE_PLANS)
  @Put('admin/exchange-rate')
  updateExchangeRate(@Body() dto: UpdateExchangeRateDto) {
    return this.subscriptions.updateExchangeRate(dto);
  }

  @RequirePermissions(Permission.REVIEW_PAYMENTS)
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

  // Sin @Roles: autoriza la pertenencia (dueño o admin) a la organización,
  // no el rol global de la cuenta — ver assertOrgManager.
  @Get('organizations/:organizationId')
  getOrganizationSubscription(@CurrentUser() user: AuthenticatedUser, @Param('organizationId') organizationId: string) {
    return this.subscriptions.getOrganizationSubscription(user.id, organizationId);
  }

  @Post('organizations/:organizationId')
  subscribeOrganization(@CurrentUser() user: AuthenticatedUser, @Param('organizationId') organizationId: string) {
    return this.subscriptions.subscribeOrganization(user.id, organizationId);
  }

  @RequirePermissions(Permission.MANAGE_PLANS)
  @Get('admin/plans')
  adminListPlans() {
    return this.subscriptions.adminListPlans();
  }

  @RequirePermissions(Permission.MANAGE_PLANS)
  @Post('admin/plans')
  createPlan(@Body() dto: UpsertPlanDto) {
    return this.subscriptions.createPlan(dto);
  }

  @RequirePermissions(Permission.MANAGE_PLANS)
  @Put('admin/plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpsertPlanDto) {
    return this.subscriptions.updatePlan(id, dto);
  }

  @RequirePermissions(Permission.MANAGE_PLANS)
  @Patch('admin/plans/:id/deactivate')
  deactivatePlan(@Param('id') id: string) {
    return this.subscriptions.deactivatePlan(id);
  }
}
