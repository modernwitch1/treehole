import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UserAuthGuard } from '../auth/user-auth.guard';

@Controller('users')
@UseGuards(UserAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getCurrentUser(user.id);
  }

  @Patch('me/dm-settings')
  setDmAllowed(@Body() body: { allowed: boolean }, @CurrentUser() user: AuthUser) {
    return this.users.setDmAllowed(user.id, body.allowed);
  }
}
