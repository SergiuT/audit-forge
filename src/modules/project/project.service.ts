import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(name: string, userId: number): Promise<Project> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['projects']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create the project
    const project = this.projectRepo.create({ name });
    const savedProject = await this.projectRepo.save(project);

    // Associate project with user
    user.projects = [...(user.projects || []), savedProject];
    await this.userRepository.save(user);

    return savedProject;
  }

  async findAllByUser(userId: number): Promise<Project[]> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['projects']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.projects;
  }

  async findOne(id: number, userId: number): Promise<Project> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['projects']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = user.projects?.find(p => p.id === id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project
  }
}
