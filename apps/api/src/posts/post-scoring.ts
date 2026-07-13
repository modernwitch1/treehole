export function hotScoreFor(score: number, createdAt: Date): number {
  const order = Math.log(Math.max(Math.abs(score), 1));
  return Math.sign(score) * order + createdAt.getTime() / 1000 / 45_000;
}
