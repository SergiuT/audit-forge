// src/modules/projects/projects.controller.ts
import { Controller, Post, Body, Get, Param, Logger, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ProjectsService } from './project.service';
import { User } from '@/common/decorators/user.decorator';

@Controller('projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(private readonly projectService: ProjectsService) { }

  @Post()
  async create(@Body('name') name: string, @User('id') userId: number) {
    this.logger.log(`Starting project creation for user ${userId}`, { name });

    try {
      const project = await this.projectService.create(name, userId);
      this.logger.log(`Successfully created project ${project.id} for user ${userId}`);
      return project;
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.logger.warn(`Bad request for project creation by user ${userId}: ${error.message}`);
        throw error;
      }
      this.logger.error(`Failed to create project for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to create project');
    }
  }

  @Get()
  async findAll(@User('id') userId: number) {
    this.logger.log(`Starting projects fetch for user ${userId}`);

    try {
      const projects = await this.projectService.findAllByUser(userId);
      this.logger.log(`Successfully fetched ${projects.length} projects for user ${userId}`);
      return projects;
    } catch (error) {
      this.logger.error(`Failed to fetch projects for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch projects');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @User('id') userId: number) {
    this.logger.log(`Starting project fetch for ID ${id} by user ${userId}`);

    try {
      const project = await this.projectService.findOne(id, userId);
      this.logger.log(`Successfully fetched project ${id} for user ${userId}`);
      return project;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Project ${id} not found for user ${userId}`);
        throw error;
      }
      this.logger.error(`Failed to fetch project ${id} for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch project');
    }
  }
}
