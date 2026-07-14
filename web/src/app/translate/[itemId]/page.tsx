import { TranslateFlow } from "./TranslateFlow";

export default async function TranslatePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <TranslateFlow itemId={Number(itemId)} />;
}
