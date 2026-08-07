interface ProcessingPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProcessingPage({ params }: ProcessingPageProps) {
  const { id } = await params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Processing</h1>
      <p className="mt-1 text-sm text-muted-foreground">Document {id}</p>
    </div>
  );
}
