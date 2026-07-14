import { ItemDetail } from "./ItemDetail";

// In Next 16, `params` is a Promise and must be awaited. The page stays a server
// component purely to unwrap it; the detail view below is a client component
// because it reads the inventory store.
export default async function ItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemDetail itemId={Number(itemId)} />;
}
