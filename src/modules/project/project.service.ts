// src/modules/projects/projects.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  async create(name: string): Promise<Project> {
    const project = this.projectRepo.create({ name });
    return this.projectRepo.save(project);
  }

  async findAll(): Promise<Project[]> {
    return this.projectRepo.find();
  }

  async findOne(id: number): Promise<Project | null> {
    return this.projectRepo.findOne({ where: { id } });
  }
}
