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
    title: "Sushi",
    highlight: "Ngada",
    description: "Sabor japonés con actitud urbana"
  },
  promotions: [
    {
      "id": "crazy-fridays",
      "name": "Crazy Fridays",
      "headline": [
        "3×1"
      ],
      "description": "Tres por uno en rollos seleccionados.",
      "image": {
        "src": "assets/images/products/rollos-variados-demo.webp",
        "alt": "Rollos variados de sushi"
      },
      "label": "Promoción ficticia · Demo",
      "link": "#menu",
      "order": 10,
      "enabled": true,
      "message": "Los viernes se ponen NGADA."
    },
    {
      "id": "birthday-ngada",
      "name": "Birthday Ngada",
      "headline": [
        "Tu día.",
        "Tu festín."
      ],
      "description": "Celebra tu cumpleaños con una experiencia especial de sushi.",
      "image": {
        "src": "assets/images/products/ngada-roll-demo.webp",
        "alt": "Rollos de salmón con flores de sakura al fondo"
      },
      "label": "Promoción ficticia · Demo",
      "link": "#menu",
      "order": 20,
      "enabled": true,
      "status": "Beneficio por definir"
    },
    {
      "id": "combo-ngada",
      "name": "Combo Ngada",
      "headline": [
        "El doble",
        "de antojo."
      ],
      "description": "Una selección de rollos y entradas japonesas para compartir.",
      "image": {
        "src": "assets/images/products/rollos-variados-demo.webp",
        "alt": "Rollos variados en una bandeja"
      },
      "label": "Promoción ficticia · Demo",
      "link": "#menu",
      "order": 30,
      "enabled": true,
      "status": "Precio pendiente",
      "secondary": {
        "src": "assets/images/products/gyozas-demo.webp",
        "alt": "Gyozas doradas"
      }
    }
  ],
  contact: { phone: "", hours: "", address: "", coverage: "", instagram: "", facebook: "", tiktok: "", socialDemo: true },
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
    logo: "assets/images/brand/sushi-ngada.svg",
    hero: "assets/images/hero/urban-rising-sun.webp",
    productPlaceholder: "assets/images/products/placeholder.svg"
  }
};
