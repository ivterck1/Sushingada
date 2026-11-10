// Personaliza estos datos para cada negocio. No incluyas secretos.
const siteConfig = {
  projectId: "sushi-ngada",
  business: {
    name: "SUSHI NGADA",
    shortName: "SUSHI NGADA",
    description: "Demostración de SUSHI NGADA con productos ficticios."
  },
  seo: {
    title: "SUSHI NGADA | Menú de demostración",
    description: "Demostración de SUSHI NGADA con un catálogo ficticio.",
    locale: "es_MX",
    robots: "noindex,follow",
    canonicalUrl: ""
  },
  whatsapp: { number: "", enabled: false },
  hero: {
    eyebrow: "Demostración",
    title: "Elige tu próximo antojo.",
    highlight: "Pide a tu manera.",
    description: "Explora el catálogo ficticio de SUSHI NGADA y prueba el carrito de demostración."
  },
  contact: { phone: "", hours: "", address: "", coverage: "", instagram: "", facebook: "", tiktok: "" },
  order: {
    pricesApproved: false,
    currency: "MXN",
    locale: "es-MX",
    storageKey: "sushi-ngada:cart:v1",
    deliveryModes: [
      { id: "recoger", label: "Recoger en restaurante", requiresAddress: false },
      { id: "domicilio", label: "Entrega a domicilio", requiresAddress: true }
    ]
  },
  images: {
    logo: "assets/images/brand/placeholder.svg",
    hero: "assets/images/hero/placeholder.svg",
    productPlaceholder: "assets/images/products/placeholder.svg"
  }
};
