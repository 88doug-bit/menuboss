import { ChefIdeaDetail } from "@/components/ideas/ChefIdeaDetail";

type Params = Promise<{ id: string }>;

export default async function ChefIdeaDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  return <ChefIdeaDetail ideaId={id} />;
}
