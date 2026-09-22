import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PostsService } from './posts.service';
import { UpsertPostDto } from './dto/upsert-post.dto';

@Roles(Role.PROFESSIONAL)
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('me')
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.listOwn(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPostDto) {
    return this.posts.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPostDto) {
    return this.posts.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.remove(user.id, id);
  }
}
