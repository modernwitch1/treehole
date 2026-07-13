import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { MerchantPrincipal } from './merchant-auth.guard';

export const MerchantAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MerchantPrincipal => {
    const request = context.switchToHttp().getRequest<Request & { merchant?: MerchantPrincipal }>();
    if (!request.merchant) {
      throw new UnauthorizedException('商家后台未登录');
    }
    return request.merchant;
  },
);
