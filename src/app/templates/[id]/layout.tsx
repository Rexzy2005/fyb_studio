import type { Metadata } from "next";

import { getTemplateById } from "@/backend/services/template.service";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteSiteUrl,
  cloudinarySocialImage,
} from "@/lib/site/metadata";

type TemplateSegmentProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await getTemplateById(id);

  if (!template) {
    return {
      title: "Template",
      description: SITE_DESCRIPTION,
      alternates: {
        canonical: `/templates/${id}`,
      },
    };
  }

  const title = `${template.name} · ${SITE_NAME}`;
  const description = `Open "${template.name}" on FYB Studio, personalize it, preview it live, and export your version.`;
  const sharePath = `/templates/${template.id}/use`;
  const previewImage = cloudinarySocialImage(template.cover.url);

  return {
    title,
    description,
    alternates: {
      canonical: sharePath,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteSiteUrl(sharePath),
      images: [
        {
          url: previewImage,
          width: 1200,
          height: 630,
          alt: `${template.name} template preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewImage],
    },
  };
}

export default function TemplateSegmentLayout({ children }: TemplateSegmentProps) {
  return children;
}
