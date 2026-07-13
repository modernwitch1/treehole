import { MerchantInviteForm } from '@/components/merchant-invite-form';

export default async function MerchantInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <MerchantInviteForm token={token ?? ''} />;
}
