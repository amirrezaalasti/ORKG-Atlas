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
    subtitle: '🌍 Mapping the global landscape of scholarly knowledge.',
    descriptionHtml:
      '<p>The ORKG Atlas is a universal dashboard built to navigate, visualize, and compare <strong>research knowledge across domains</strong>. By weaving together community templates in the <strong>Open Research Knowledge Graph (ORKG)</strong>, we turn static publications into a living, structured atlas of discovery 🗺️✨.</p>',
    ctaPrimary: { label: '🔭 Explore templates', href: '#templates' },
    ctaSecondary: { label: '📖 Learn more', href: '#about' },
  },
  templateCoverage: {
    title: '📚 Universal template coverage',
    subtitleHtml:
      '<p>One dashboard for many scholarly lenses — from anchored empirical studies and NLP workflows to theoretical contributions and emerging community schemas 🌐</p>',
    cards: [
      {
        title: '🔬 Empirical & NLP',
        descriptionHtml:
          '<p>Grounded in the lineage of <strong>EmpiRE-Compass</strong> and <strong>NLP4RE</strong>: repeatable, structured views of experiments, datasets, and evaluation practice.</p>',
      },
      {
        title: '🌐 Cross-domain',
        descriptionHtml:
          '<p>Designed to welcome physics, life sciences, social sciences, humanities, and beyond — surfaced together instead of scattered across disconnected tools 🔭🧬📚.</p>',
      },
      {
        title: '🧩 Community schemas',
        descriptionHtml:
          '<p>Room for evolving, community-maintained templates as the ORKG ecosystem grows — Atlas stays the compass, templates stay the territories 🚀.</p>',
      },
    ],
  },
  aboutProject: {
    title: '💡 About ORKG Atlas',
    content: `<p>The ORKG Atlas evolved from <strong>EmpiRE-Compass</strong>, a focused workspace for empirical research practice and NLP4RE-style templates within Requirements Engineering 🧭 Recognizing the need for a fuller picture of the graph, Atlas now aims to spotlight <strong>global research knowledge</strong> aggregated through ORKG — without losing the rigor that started this journey ✨</p><p>Our goal is to reduce information silos and give curious researchers a bird's-eye map of structured science — across venues, disciplines, and template families 🌍</p>`,
    themes: [],
  },
  keyFeatures: {
    title: '🧭 Why "Atlas"?',
    features: [
      {
        title: '🔗 Unified exploration',
        description:
          '<p>No hopping between fragmented dashboards 🧩 ORKG Atlas is a deliberate <strong>single entry point</strong> for competency questions that already live across ORKG templates.</p>',
      },
      {
        title: '⚖️ Comparative intelligence',
        description:
          '<p>Contrast methods, artefacts, benchmarks, and claims where semantic predicates align — illuminating how fields learn from each other 📊🔍.</p>',
      },
      {
        title: '📡 Live-informed visualization',
        description:
          '<p>Leverage up-to-date ORKG data inside the tooling you already use here — watch adoption, thematic growth, and graph-native insights evolve in near real time 🛰️.</p>',
      },
    ],
  },
  futureDevelopment: {
    title: '🚀 Ecosystem horizons',
    intro:
      'We are widening the atlas basemap while keeping authoring quality front and centre:',
    phases: [
      {
        phase: 'Near term',
        goal: '🧭 deepen coverage for flagship RE datasets while prototyping cross-template navigation patterns every ORKG curator can reuse.',
      },
      {
        phase: 'Mid term',
        goal: '🌐 onboard additional ORKG template families beyond the originals that seeded EmpiRE-Compass.',
      },
      {
        phase: 'Long term',
        goal: '✨ co-design assistive tooling with the ORKG community so each new template automatically gains Atlas-quality storytelling widgets.',
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
      headline: '🤝 Ready to contribute?',
      bodyHtml:
        '<p>Add your research artefacts to ORKG — once curated, Atlas-friendly views can amplify their reach 🌍</p>',
      buttonLabel: 'Visit orkg.org ➜',
      buttonHref: 'https://orkg.org',
      attributionHtml: `<p>ORKG Atlas · Built with care on foundations laid by EmpiRE-Compass · © ${new Date().getFullYear()}</p>`,
    },
  },
  templateInfoBoxes: {
    R186491: {
      title: '📊 Empirical research practice',
      description:
        'Structured competency questions grounded in repeatable empirical workflows — ideal for surveying how communities conduct and report research.',
    },
    R1544125: {
      title: '🤖 NLP4RE ID Cards',
      description:
        'Language-technology-centric lenses on requirements-engineering artefacts — bridging qualitative needs with reproducible NLP evidence.',
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
