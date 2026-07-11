import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { BoardsService } from './boards.service';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  listBoards() {
    return this.boards.listBoards();
  }

  @Get('pending')
  @UseGuards(AdminAuthGuard)
  listPendingApplications() {
    return this.boards.listPendingApplications();
  }

  @Get(':slug')
  getBoard(@Param('slug') slug: string) {
    return this.boards.getBoard(slug);
  }

  @Post()
  @UseGuards(UserAuthGuard)
  applyForBoard(
    @Body() body: { name: string; description: string; reason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.boards.applyForBoard({
      ...body,
      applicantId: user.id,
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  approveBoard(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.boards.approveBoard(id, BigInt(req.admin!.id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  rejectBoard(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AdminRequest,
  ) {
    return this.boards.rejectBoard(id, BigInt(req.admin!.id), body.reason);
  }
}
