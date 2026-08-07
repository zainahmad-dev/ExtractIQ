interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Review</h1>
      <p className="mt-1 text-sm text-muted-foreground">Document {id}</p>
    </div>
  );
}
