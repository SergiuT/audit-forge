// src/modules/projects/projects.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ProjectsService } from './project.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectService: ProjectsService) {}

  @Post()
  create(@Body('name') name: string) {
    return this.projectService.create(name);
  }

  @Get()
  findAll() {
    return this.projectService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.projectService.findOne(id);
  }
}
