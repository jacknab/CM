import { z } from 'zod';
export const schemas = {
  pages: {
    home: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string(),
        "ctaPrimary": z.string(),
        "ctaSecondary": z.string(),
        "socialProof": z.string()
      }),
      "directoryBadges": z.object({
        "label": z.string(),
        "platforms": z.array(z.object({
          "id": z.string(),
          "name": z.string(),
          "url": z.string()
        }))
      }),
      "features": z.array(z.object({
        "id": z.string(),
        "tag": z.string(),
        "title": z.string(),
        "description": z.string(),
        "cta": z.string()
      })),
      "pricing": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "price": z.string(),
        "period": z.string(),
        "description": z.string(),
        "cta": z.string(),
        "featured": z.boolean()
      })),
      "cta": z.object({
        "headline": z.string(),
        "subhead": z.string(),
        "button": z.string(),
        "note": z.string()
      })
    }),
    features: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "sections": z.array(z.object({
        "id": z.string(),
        "tag": z.string(),
        "headline": z.string(),
        "body": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        })),
        "bullets": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        })),
        "autumnLink": z.boolean()
      })),
      "cta": z.object({
        "headline": z.string(),
        "subhead": z.string(),
        "button": z.string()
      })
    }),
    pricing: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "plans": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "price": z.string(),
        "period": z.string(),
        "description": z.string(),
        "featured": z.boolean(),
        "cta": z.string(),
        "features": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        }))
      })),
      "comparison": z.object({
        "headline": z.string(),
        "categories": z.array(z.object({
          "id": z.string(),
          "name": z.string(),
          "rows": z.array(z.object({
            "id": z.string(),
            "feature": z.string(),
            "starter": z.string(),
            "pro": z.string(),
            "enterprise": z.string()
          }))
        }))
      }),
      "faq": z.array(z.object({
        "id": z.string(),
        "question": z.string(),
        "answer": z.string()
      })),
      "cta": z.object({
        "headline": z.string(),
        "subhead": z.string(),
        "button": z.string()
      })
    }),
    products: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "mainProducts": z.array(z.object({
        "id": z.string(),
        "badge": z.string(),
        "name": z.string(),
        "tagline": z.string(),
        "description": z.string(),
        "price": z.string(),
        "financing": z.string(),
        "cta": z.string(),
        "highlights": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        }))
      })),
      "accessories": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "description": z.string(),
        "price": z.string(),
        "compatible": z.string()
      })),
      "payments": z.object({
        "headline": z.string(),
        "subhead": z.string(),
        "tiers": z.array(z.object({
          "id": z.string(),
          "name": z.string(),
          "volume": z.string(),
          "rate": z.string(),
          "rateNote": z.string(),
          "monthly": z.string()
        })),
        "note": z.string()
      }),
      "faq": z.array(z.object({
        "id": z.string(),
        "question": z.string(),
        "answer": z.string()
      })),
      "cta": z.object({
        "headline": z.string(),
        "subhead": z.string(),
        "button": z.string(),
        "secondary": z.string()
      })
    }),
    contact: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "info": z.object({
        "email": z.string(),
        "phone": z.string(),
        "hours": z.string(),
        "responseTime": z.string()
      }),
      "form": z.object({
        "heading": z.string(),
        "subheading": z.string(),
        "successTitle": z.string(),
        "successMessage": z.string(),
        "topics": z.array(z.object({
          "id": z.string(),
          "label": z.string()
        }))
      })
    }),
    about: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "mission": z.object({
        "heading": z.string(),
        "body": z.string()
      }),
      "values": z.array(z.object({
        "id": z.string(),
        "title": z.string(),
        "body": z.string()
      })),
      "team": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "role": z.string(),
        "bio": z.string()
      })),
      "cta": z.object({
        "heading": z.string(),
        "subhead": z.string(),
        "button": z.string()
      })
    }),
    blog: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "posts": z.array(z.object({
        "id": z.string(),
        "slug": z.string(),
        "category": z.string(),
        "title": z.string(),
        "excerpt": z.string(),
        "date": z.string(),
        "readTime": z.string()
      })),
      "categories": z.array(z.object({
        "id": z.string(),
        "label": z.string()
      }))
    }),
    careers: z.object({
      "eyebrow": z.string(),
      "headline": z.string(),
      "subhead": z.string(),
      "cta": z.string()
    }),
    changelog: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "releases": z.array(z.object({
        "id": z.string(),
        "version": z.string(),
        "date": z.string(),
        "tags": z.array(z.string()),
        "items": z.array(z.object({
          "id": z.string(),
          "type": z.string(),
          "text": z.string()
        }))
      }))
    }),
    roadmap: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string()
      }),
      "columns": z.array(z.object({
        "id": z.string(),
        "status": z.string(),
        "label": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "title": z.string(),
          "description": z.string(),
          "votes": z.number()
        }))
      })),
      "cta": z.object({
        "heading": z.string(),
        "subhead": z.string(),
        "button": z.string()
      })
    }),
    privacy: z.string(),
    terms: z.string(),
    comparison_layout: z.object({
      "heroBadge": z.string(),
      "heroSeePricingLabel": z.string(),
      "overviewCertxaLabel": z.string(),
      "differentiatorsSectionHeadline": z.string(),
      "tableSectionHeadline": z.string(),
      "tableCertxaColLabel": z.string(),
      "tableFeatureColLabel": z.string(),
      "faqSectionHeadline": z.string(),
      "ctaHeadline": z.string(),
      "ctaSubhead": z.string(),
      "ctaPrimaryLabel": z.string(),
      "ctaSecondaryLabel": z.string()
    }),
    backlinks_trade_publications: z.object({
      "eyebrow": z.string(),
      "heading": z.string(),
      "description": z.string(),
      "badges": z.object({
        "count": z.string(),
        "angle": z.string(),
        "personalised": z.string()
      }),
      "tips": z.object({
        "heading": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        }))
      })
    }),
    backlinks_roundup_outreach: z.object({
      "eyebrow": z.string(),
      "heading": z.string(),
      "description": z.string(),
      "statsLabels": z.object({
        "toPitch": z.string(),
        "pitched": z.string(),
        "listed": z.string()
      }),
      "queriesHeading": z.string(),
      "queriesDescription": z.string(),
      "assetsHeading": z.string(),
      "assetsDescription": z.string(),
      "trackerHeading": z.string(),
      "addHeading": z.string(),
      "statusLabels": z.object({
        "notPitched": z.string(),
        "pitched": z.string(),
        "listed": z.string(),
        "declined": z.string()
      })
    }),
    booking: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string(),
        "ctaPrimary": z.string(),
        "ctaSecondary": z.string(),
        "socialProof": z.string()
      }),
      "howItWorks": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "steps": z.array(z.object({
          "id": z.string(),
          "number": z.string(),
          "title": z.string(),
          "body": z.string()
        }))
      }),
      "features": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "title": z.string(),
          "body": z.string()
        }))
      }),
      "integrations": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "body": z.string(),
        "channels": z.array(z.object({
          "id": z.string(),
          "name": z.string()
        }))
      }),
      "faq": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "question": z.string(),
          "answer": z.string()
        }))
      }),
      "cta": z.object({
        "heading": z.string(),
        "subhead": z.string(),
        "button": z.string(),
        "secondary": z.string()
      }),
      "share": z.object({
        "label": z.string(),
        "tweet": z.string()
      })
    }),
    autumn: z.object({
      "hero": z.object({
        "liveTag": z.string(),
        "eyebrow": z.string(),
        "headline": z.string(),
        "subhead": z.string(),
        "ctaPrimary": z.string(),
        "ctaSecondary": z.string(),
        "stats": z.array(z.object({
          "id": z.string(),
          "value": z.string(),
          "label": z.string()
        }))
      }),
      "intro": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "body": z.string(),
        "bullets": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        }))
      }),
      "capabilities": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "title": z.string(),
          "body": z.string()
        }))
      }),
      "liveAwareness": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "intro": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "title": z.string(),
          "body": z.string()
        }))
      }),
      "setup": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "body": z.string(),
        "steps": z.array(z.object({
          "id": z.string(),
          "number": z.string(),
          "title": z.string(),
          "body": z.string()
        }))
      }),
      "pricing": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "body": z.string(),
        "points": z.array(z.object({
          "id": z.string(),
          "title": z.string(),
          "body": z.string()
        })),
        "planNote": z.string()
      }),
      "faq": z.object({
        "eyebrow": z.string(),
        "heading": z.string(),
        "items": z.array(z.object({
          "id": z.string(),
          "question": z.string(),
          "answer": z.string()
        }))
      }),
      "cta": z.object({
        "heading": z.string(),
        "subhead": z.string(),
        "button": z.string(),
        "secondary": z.string()
      }),
      "share": z.object({
        "label": z.string(),
        "tweet": z.string()
      })
    })
  },
  data: {
    comparisons: z.array(z.object({
      "id": z.string(),
      "slug": z.string(),
      "competitor": z.string(),
      "metaTitle": z.string(),
      "metaDescription": z.string(),
      "heroEyebrow": z.string(),
      "heroHeadline": z.string(),
      "heroSubhead": z.string(),
      "heroCta": z.string(),
      "targetBusinesses": z.string(),
      "competitorSummary": z.string(),
      "certxaSummary": z.string(),
      "differentiators": z.array(z.object({
        "id": z.string(),
        "title": z.string(),
        "certxa": z.string(),
        "competitor": z.string()
      })),
      "comparisonTable": z.array(z.object({
        "id": z.string(),
        "feature": z.string(),
        "certxa": z.boolean(),
        "competitor": z.boolean()
      })),
      "faq": z.array(z.object({
        "id": z.string(),
        "question": z.string(),
        "answer": z.string()
      }))
    }))
  }
};
export type Schemas = typeof schemas;