import { Injectable, CanActivate, ExecutionContext, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../entities/user.entity";

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  private readonly logger = new Logger(ProjectAccessGuard.name);
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    this.logger.log(`User: ${JSON.stringify(user)}`);
    if (!user) return false;

    const projectId = parseInt(request.params.projectId || request.body.projectId);

    // Admins can access everything
    if (user.role === UserRole.ADMIN) return true;

    // Users can only access their assigned projects
    return user.projects?.some(p => p.id === projectId);
  }
}
