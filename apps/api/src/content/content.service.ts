import { Injectable } from '@nestjs/common';
import { CommentsService, type CreateCommentInput, type ListCommentsOptions } from '../comments';
import {
  PostsCommandService,
  PostsService,
  type CreatePostInput,
  type PostListOptions,
} from '../posts';
import { ReactionsService, type ReactionTarget, type ReactionValue } from '../reactions';
import { ReportsService, type CreateReportInput } from '../reports';

@Injectable()
export class ContentService {
  constructor(
    private readonly posts: PostsService,
    private readonly postCommands: PostsCommandService,
    private readonly comments: CommentsService,
    private readonly reactions: ReactionsService,
    private readonly reports: ReportsService,
  ) {}

  listPosts(opts: PostListOptions) {
    return this.posts.listPosts(opts);
  }

  getPost(id: string, userId?: bigint) {
    return this.posts.getPost(id, userId);
  }

  createPost(data: CreatePostInput) {
    return this.postCommands.createPost(data);
  }

  createComment(data: CreateCommentInput) {
    return this.comments.createComment(data);
  }

  listComments(postId: string, opts?: ListCommentsOptions) {
    return this.comments.listComments(postId, opts);
  }

  vote(targetType: ReactionTarget, targetId: string, value: ReactionValue, userId: bigint) {
    return this.reactions.vote(targetType, targetId, value, userId);
  }

  reportTarget(data: CreateReportInput) {
    return this.reports.reportTarget(data);
  }
}
