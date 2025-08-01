// src/modules/projects/projects.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ProjectsService } from './project.service';
import { User } from '@/common/decorators/user.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectService: ProjectsService) {}

  @Post()
  create(@Body('name') name: string, @User('id') userId: number) {
    return this.projectService.create(name, userId);
  }

  @Get()
  findAll(@User('id') userId: number) {
    return this.projectService.findAllByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: number, @User('id') userId: number) {
    return this.projectService.findOne(id, userId);
  }
}
