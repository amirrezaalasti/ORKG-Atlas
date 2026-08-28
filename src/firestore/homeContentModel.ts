/**
 * Home content types and defaults — safe to import from Node scripts (no frontend API clients).
 */

export interface HeroCta {
  label: string;
  href: string;
}

export interface HeaderContent {
  title: string;
  subtitle: string;
  descriptionHtml?: string;
  ctaPrimary?: HeroCta;
  ctaSecondary?: HeroCta;
}

export interface TemplateCoverageCard {
  title: string;
  descriptionHtml: string;
}

export interface TemplateCoverageContent {
  title: string;
  subtitleHtml: string;
  cards: TemplateCoverageCard[];
}

export interface FooterCtaContent {
  headline: string;
  bodyHtml: string;
  buttonLabel: string;
  buttonHref: string;
  attributionHtml: string;
}

export interface AboutProjectContent {
  title: string;
  content: string;
  themes: string[];
}

export interface Feature {
  title: string;
  description: string;
}

export interface KeyFeaturesContent {
  title: string;
  features: Feature[];
}

export interface Phase {
  phase: string;
  goal: string;
}

export interface FutureDevelopmentContent {
  title: string;
  intro: string;
  phases: Phase[];
}

export interface ContactContent {
  title: string;
  name: string;
  position: string;
  organization: string;
  address: string[];
  email: string;
}

export interface Partner {
  label: string;
  link: string;
  logoUrl: string;
}

export interface PartnersContent {
  title: string;
  partners: Partner[];
  footerCta?: FooterCtaContent;
}

export interface TemplateInfoBox {
  title: string;
  description: string;
}

export interface TemplateInfoBoxes {
  [templateId: string]: TemplateInfoBox;
}

export interface Template {
  id: string;
  title: string;
}

export interface HomeContentData {
  header: HeaderContent;
  templateCoverage?: TemplateCoverageContent;
  aboutProject: AboutProjectContent;
  keyFeatures: KeyFeaturesContent;
  futureDevelopment: FutureDevelopmentContent;
  contact: ContactContent;
  partners: PartnersContent;
  templateInfoBoxes: TemplateInfoBoxes;
  templates: Template[];
  updatedAt?: string;
}

export const defaultHomeContent: HomeContentData = {
  header: {
    title: 'ORKG Atlas',
    subtitle:
      'A neuro-symbolic dashboard for mapping, exploring, and reusing scholarly knowledge across every ORKG template.',
    descriptionHtml:
      '<p>Research knowledge graphs make literature-review data machine-actionable, but asking a new question still meant writing SPARQL — so what a community could ask was fixed by whoever built its dashboard. <strong>ORKG Atlas</strong> turns that dashboard from something researchers <em>read</em> into something they <em>write with</em>.</p>',
    ctaPrimary: { label: 'Explore templates', href: '#templates' },
    ctaSecondary: { label: 'Learn more', href: '#about' },
  },
  templateCoverage: {
    title: 'Coverage of the ORKG catalogue',
    subtitleHtml:
      '<p>On 28 August 2026 we retrieved all <strong>1,470</strong> templates from the public ORKG API — spanning <strong>119</strong> research fields — and ran the schema resolver over each. A usable schema is a target class plus at least one active property.</p>',
    cards: [
      {
        title: '96.7% usable',
        descriptionHtml:
          '<p><strong>1,421</strong> templates yield a schema Atlas can build a prompt from. The remaining 49 declare a class with no active property, so they expose nothing to query.</p>',
      },
      {
        title: '44% nested',
        descriptionHtml:
          '<p><strong>647</strong> templates reference another template; 319 need expansion depth two or beyond, and the largest expansion spans 58 templates. Recursive resolution is not an edge case.</p>',
      },
      {
        title: '23.9% cyclic',
        descriptionHtml:
          '<p><strong>352</strong> expansions revisit a template already seen, so cycle tracking is mandatory rather than defensive. Schema coverage is largely solved; the problem shifts to size and shape.</p>',
      },
    ],
  },
  aboutProject: {
    title: 'From a dashboard you read to one you write with',
    content: `<p>Our earlier <strong>EmpiRE-Compass</strong> showed the ceiling: its 26 competency questions, queries, and prompt guidance were hand-written into the source for two curated domains. A third domain — or an unanticipated question inside an existing one — needed a developer and a redeployment. Users could read it; they could not extend it.</p><p><strong>ORKG Atlas</strong> resolves any template schema at run time through the public ORKG API and moves question authoring into the community. The <strong>symbolic layer</strong> (ORKG, SPARQL, the triplestore) is the only source of factual data. The <strong>neural layer</strong> drafts queries and interprets only the bindings a query returned — so the graph, rather than the model, decides correctness.</p>`,
    themes: [
      "Resolve a template's nested schema at run time — no domain knowledge compiled in.",
      'Let an LLM draft SPARQL, then execute it on the live endpoint.',
      "Repair from the endpoint's own response (parse error, empty result, or all-null columns) and retry up to three times.",
    ],
  },
  keyFeatures: {
    title: 'How Atlas asks the graph',
    features: [
      {
        title: 'Resolve any template at run time',
        description:
          '<p>Atlas follows nested templates so properties reached through intermediate resources are included, then injects the derived schema — target class, property paths, labels — into the prompt.</p>',
      },
      {
        title: 'Draft, execute, repair',
        description:
          '<p>The LLM writes SPARQL; Atlas runs it on the live endpoint and repairs it from that response, including hints for recurring failure modes. SPARQL and the code that shapes results stay editable and re-run in one click.</p>',
      },
      {
        title: 'Publish a re-runnable bundle',
        description:
          "<p>Each analysis is saved as a moderated community bundle — question, query, processing code, chart, interpretation, template binding. Opening someone else's analysis means re-running an experiment, not reading a claim.</p>",
      },
    ],
  },
  futureDevelopment: {
    title: 'Open problems',
    intro:
      'Coverage is largely solved. The remaining challenges are schema size, thin templates, and telling a bad query from a sparsely curated graph.',
    phases: [
      {
        phase: 'Thin templates',
        goal: '448 templates (30.5%) declare only one or two properties, so many worthwhile competency questions cannot be answered from one template. Atlas currently binds one question to one template; cross-template synthesis is future work.',
      },
      {
        phase: 'Schema size',
        goal: '17 templates carry 25 or more properties, and the largest expansion spans 58 — more than fits a prompt. Pruning the schema risks discarding the very property the question needed.',
      },
      {
        phase: 'Sparse curation',
        goal: 'A template declares what instances may state, not what they do. A perfect query can return nothing because papers were curated without that property — and the repair loop currently treats an empty result as failure.',
      },
    ],
  },
  contact: {
    title: 'Contact',
    name: 'Dr. rer. nat. Oliver Karras',
    position: 'Researcher and Data Scientist - Open Research Knowledge Graph',
    organization: 'TIB - Leibniz Information Centre for Science and Technology',
    address: ['Welfengarten 1B', '30167 Hannover'],
    email: 'oliver.karras@tib.eu',
  },
  partners: {
    title: 'Project Partners & Resources',
    partners: [
      {
        label: 'TIB',
        link: 'https://www.tib.eu/de/forschung-entwicklung/open-research-knowledge-graph',
        logoUrl: '/src/assets/TIB.png',
      },
      {
        label: 'ORKG',
        link: 'https://orkg.org',
        logoUrl: '/src/assets/ORKG.png',
      },
      {
        label: 'ORKG Ask',
        link: 'https://ask.orkg.org/',
        logoUrl: '/src/assets/ORKGask.png',
      },
      {
        label: 'KG-EmpiRE',
        link: 'https://github.com/okarras/EmpiRE-Analysis',
        logoUrl: '/src/assets/KGEmpire.png',
      },
    ],
    footerCta: {
      headline: 'Contribute a question in your own words',
      bodyHtml:
        '<p>A domain expert states it, watches the repair loop converge on a query the endpoint accepts, and publishes a re-runnable bundle to the community library — without SPARQL fluency, schema knowledge, or commit access.</p>',
      buttonLabel: 'Visit orkg.org',
      buttonHref: 'https://orkg.org',
      attributionHtml: `<p>ORKG Atlas · Grew out of EmpiRE-Compass · © ${new Date().getFullYear()}</p>`,
    },
  },
  templateInfoBoxes: {
    R186491: {
      title: 'Empirical Research Practice',
      description:
        'Template R186491 — the schema behind KG-EmpiRE. Competency questions such as "How often are which empirical methods used over time?" are queries over the properties it defines: research method, data collection method, threats to validity.',
    },
    R1544125: {
      title: 'NLP4RE ID Card',
      description:
        'One of the two curated domains that EmpiRE-Compass hard-coded. Atlas still opens it as a first-class territory, now via the same runtime schema resolver used for the rest of the catalogue.',
    },
  },
  templates: [
    {
      id: 'R186491',
      title: 'Empirical Research Practice',
    },
    {
      id: 'R1544125',
      title: 'NLP4RE ID Card',
    },
  ],
};

export const mergeWithHomeDefaults = (
  data: Partial<HomeContentData> & Record<string, unknown>
): HomeContentData => ({
  ...defaultHomeContent,
  ...data,
  header: { ...defaultHomeContent.header, ...data.header },
  templateCoverage:
    data.templateCoverage ?? defaultHomeContent.templateCoverage,
  aboutProject: {
    ...defaultHomeContent.aboutProject,
    ...data.aboutProject,
    themes: data.aboutProject?.themes ?? defaultHomeContent.aboutProject.themes,
  },
  keyFeatures: {
    ...defaultHomeContent.keyFeatures,
    ...data.keyFeatures,
    features:
      data.keyFeatures?.features ?? defaultHomeContent.keyFeatures.features,
  },
  futureDevelopment: {
    ...defaultHomeContent.futureDevelopment,
    ...data.futureDevelopment,
    phases:
      data.futureDevelopment?.phases ??
      defaultHomeContent.futureDevelopment.phases,
  },
  contact: { ...defaultHomeContent.contact, ...data.contact },
  partners: {
    ...defaultHomeContent.partners,
    ...data.partners,
    partners: data.partners?.partners ?? defaultHomeContent.partners.partners,
    footerCta:
      data.partners?.footerCta ?? defaultHomeContent.partners.footerCta,
  },
  templateInfoBoxes: {
    ...defaultHomeContent.templateInfoBoxes,
    ...data.templateInfoBoxes,
  },
  templates:
    data.templates && data.templates.length > 0
      ? data.templates
      : defaultHomeContent.templates,
});
