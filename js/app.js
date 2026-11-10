const menuGrid = document.querySelector("#menu-grid");
const categoryList = document.querySelector(".category-list");
const categorySelect = document.querySelector("#category-select");
const categoryStatus = document.querySelector("#category-status");
const cartPanel = document.querySelector("#carrito");
const cartHome = cartPanel?.parentElement;
const cartItemsContainer = document.querySelector("#cart-items");
const emptyCartMessage = document.querySelector("#empty-cart");
const cartSubtotalElement = document.querySelector("#cart-subtotal");
const cartTotalElement = document.querySelector("#cart-total");
const whatsappButton = document.querySelector(".whatsapp-button");
const orderMessageElement = document.querySelector("#order-message");
const headerCartCountElement = document.querySelector("#header-cart-count");
const mobileOrderBar = document.querySelector("#mobile-order-bar");
const mobileOrderToggle = document.querySelector("#mobile-order-toggle");
const mobileOrderClose = document.querySelector("#mobile-order-close");
const mobileCartDialog = document.querySelector("#mobile-cart-dialog");
const mobileCartViewport = window.matchMedia("(width < 768px)");
const mobileOrderCountElement = document.querySelector("#mobile-order-count");
const mobileOrderTotalElement = document.querySelector("#mobile-order-total");
const cartStatus = document.querySelector("#cart-status");
const mobilePanelLinks = document.querySelectorAll('a[href="#pedido"], a[href="#carrito"]');
let cartOpener = null;
let cartAnnouncementTimer = 0;
const APP_CART_STORAGE_KEY = siteConfig.order.storageKey;
// Sustituir por el numero real con codigo de pais, sin +, espacios ni guiones.
const RESTAURANT_WHATSAPP_NUMBER = siteConfig.whatsapp.number;
const WHATSAPP_BASE_URL = "https://wa.me";
const PENDING_PRICES_MESSAGE = "Los precios están pendientes de confirmación. Por ahora no se pueden enviar pedidos.";
const cartItems = [];

const currencyFormatter = new Intl.NumberFormat(siteConfig.order.locale, {
  style: "currency",
  currency: siteConfig.order.currency,
});

// Convierte precios numericos a la moneda y locale configurados.
function formatPrice(price) {
  return siteConfig.order.pricesApproved === true ? currencyFormatter.format(price) : "—";
}

// Busca un producto del menu usando su id unico.
function findProductById(productId) {
  return menuItems.find((product) => product.id === productId);
}

// Busca un producto que ya esta dentro del carrito.
function findCartItemById(productId) {
  return cartItems.find((item) => item.id === productId);
}

// Cuenta todas las unidades agregadas al carrito.
function getCartItemCount() {
  return cartItems.reduce((total, item) => total + item.quantity, 0);
}

// Aplica el mismo respaldo a imágenes estáticas y creadas por la app.
function watchProductImage(image) {
  const fallback = siteConfig.images.productPlaceholder;
  function markUnavailable() {
    image.dataset.imageState = "unavailable";
  }
  function showFallback() {
    image.dataset.imageState = "fallback";
    image.addEventListener("error", markUnavailable, { once: true });
    image.src = fallback;
  }

  if (image.dataset.imageState === "fallback") {
    image.addEventListener("error", markUnavailable, { once: true });
    if (image.complete && image.naturalWidth === 0 && image.getAttribute("src")) markUnavailable();
  } else if (image.complete && image.naturalWidth === 0 && image.getAttribute("src")) {
    showFallback();
  } else {
    image.addEventListener("error", showFallback, { once: true });
  }
}

function createProductImage(product, { alt = "", lazy = false } = {}) {
  const image = document.createElement("img");
  const source = product?.imagen?.trim();
  const fallback = siteConfig.images.productPlaceholder;
  image.alt = alt;
  if (lazy) image.loading = "lazy";
  if (!source || source === fallback) image.dataset.imageState = "fallback";
  watchProductImage(image);
  image.src = source || fallback;
  return image;
}

// Lee y limpia los datos actuales del formulario del cliente.
function getCustomerData() {
  const nameInput = document.querySelector("#customer-name");
  const deliveryTypeInput = document.querySelector('input[name="deliveryType"]:checked');
  const addressInput = document.querySelector("#customer-address");
  const notesInput = document.querySelector("#order-notes");

  return {
    name: nameInput ? nameInput.value.trim() : "",
    deliveryType: deliveryTypeInput ? deliveryTypeInput.value : "",
    address: addressInput ? addressInput.value.trim() : "",
    notes: notesInput ? notesInput.value.trim() : "",
  };
}

function findDeliveryMode(id) {
  return siteConfig.order.deliveryModes.find((mode) => mode.id === id);
}

function renderDeliveryOptions() {
  const options = document.querySelector("#delivery-options");
  const addressInput = document.querySelector("#customer-address");
  const addressLabel = document.querySelector('label[for="customer-address"]');

  function updateAddressField() {
    const requiresAddress = findDeliveryMode(getCustomerData().deliveryType)?.requiresAddress === true;
    addressLabel.hidden = !requiresAddress;
    addressInput.hidden = !requiresAddress;
    addressInput.disabled = !requiresAddress;
    addressInput.required = requiresAddress;
  }

  siteConfig.order.deliveryModes.forEach((mode) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "deliveryType";
    radio.value = mode.id;
    label.append(radio, mode.label);
    options.append(label);
  });
  options.addEventListener("change", updateAddressField);
  updateAddressField();
}

// Muestra mensajes visibles y anunciables para errores o avisos del pedido.
function showOrderMessage(message, type = "error") {
  if (!orderMessageElement) {
    return;
  }

  orderMessageElement.textContent = message;
  orderMessageElement.classList.remove("is-error", "is-success");
  orderMessageElement.classList.add(type === "success" ? "is-success" : "is-error");
}

// Limpia el mensaje de validacion del pedido.
function clearOrderMessage() {
  if (!orderMessageElement) {
    return;
  }

  orderMessageElement.textContent = "";
  orderMessageElement.classList.remove("is-error", "is-success");
}

// Guarda el estado actual del carrito en el navegador.
function saveCartToStorage() {
  try {
    localStorage.setItem(APP_CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch (error) {
    console.warn("No se pudo guardar el carrito.", error);
  }
}

// Revisa que los datos guardados tengan productos validos y cantidades seguras.
function validateStoredCart(storedCart) {
  if (!Array.isArray(storedCart)) {
    return null;
  }

  const validatedItems = [];
  let hasInvalidItem = false;

  storedCart.forEach((storedItem) => {
    if (!storedItem || typeof storedItem.id !== "string") {
      hasInvalidItem = true;
      return;
    }

    const product = findProductById(storedItem.id);
    const quantity = Number(storedItem.quantity);

    if (!product || !product.disponible || !Number.isSafeInteger(quantity) || quantity <= 0) {
      hasInvalidItem = true;
      return;
    }

    const existingItem = validatedItems.find((item) => item.id === product.id);

    if (existingItem) {
      if (!Number.isSafeInteger(existingItem.quantity + quantity)) { hasInvalidItem = true; return; }
      existingItem.quantity += quantity;
      return;
    }

    validatedItems.push({
      id: product.id,
      name: product.nombre,
      price: product.precio,
      quantity,
    });
  });

  if (hasInvalidItem) {
    return null;
  }

  return validatedItems;
}

// Lee el carrito guardado; si esta corrupto, lo limpia y regresa un carrito vacio.
function loadCartFromStorage() {
  try {
    const storedCart = localStorage.getItem(APP_CART_STORAGE_KEY);

    if (!storedCart) {
      return [];
    }

    const parsedCart = JSON.parse(storedCart);
    const validatedCart = validateStoredCart(parsedCart);

    if (!validatedCart) {
      localStorage.removeItem(APP_CART_STORAGE_KEY);
      return [];
    }

    return validatedCart;
  } catch (error) {
    try { localStorage.removeItem(APP_CART_STORAGE_KEY); } catch { /* Almacenamiento bloqueado. */ }
    return [];
  }
}

// Reemplaza el carrito en memoria con datos previamente validados.
function restoreCartItems(storedItems) {
  cartItems.splice(0, cartItems.length, ...storedItems);
}

// Reutiliza las secciones del catálogo estático.
function selectCategory(category) {
  if (!menuGrid.hasAttribute("data-interactive")) return;
  const groups = [...menuGrid.querySelectorAll(".menu-category")];
  const active = groups.find(group => group.dataset.menuCategory === category);
  if (!active) return;

  categorySelect.value = category;
  const focusedGroup = document.activeElement?.closest(".menu-category");
  if (focusedGroup && focusedGroup !== active) categorySelect.focus({ preventScroll: true });
  groups.forEach(group => { group.hidden = group !== active; });

  categoryList.querySelectorAll("button[data-category]").forEach(button => {
    const selected = button.dataset.category === category;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (selected) revealCategoryButton(button);
  });

  const count = active.querySelectorAll(".menu-card").length;
  categoryStatus.textContent = `${category} · ${count} ${count === 1 ? "producto" : "productos"}`;
}

// Desplaza solo la fila, sin mover el foco ni la página.
function revealCategoryButton(button) {
  const rail = categoryList.getBoundingClientRect();
  const bounds = button.getBoundingClientRect();
  const inset = 7;
  if (bounds.left < rail.left + inset) {
    categoryList.scrollLeft += bounds.left - rail.left - inset;
  } else if (bounds.right > rail.right - inset) {
    categoryList.scrollLeft += bounds.right - rail.right + inset;
  }
}

// Atiende la seleccion con mouse o teclado mediante botones nativos.
function handleCategoryClick(event) {
  const button = event.target.closest("button[data-category]");

  if (!button || !categoryList.contains(button)) {
    return;
  }

  selectCategory(button.dataset.category);
}

// Agrega un producto nuevo al carrito o aumenta su cantidad si ya existe.
function addProductToCart(productId) {
  const product = findProductById(productId);

  if (!product || !product.disponible) {
    return;
  }

  const existingCartItem = findCartItemById(productId);

  if (existingCartItem) {
    const previousQuantity = existingCartItem.quantity;
    updateCartItemQuantity(productId, 1);
    if (existingCartItem.quantity > previousQuantity) announceCartAddition(product.nombre);
    return;
  }

  cartItems.push({
    id: product.id,
    name: product.nombre,
    price: product.precio,
    quantity: 1,
  });

  saveCartToStorage();
  renderCart();
  announceCartAddition(product.nombre);
}

// El resumen oculto no anuncia altas. Se usa un único estado persistente solo
// en móvil con panel cerrado; con resumen visible se conserva su aria-live.
function announceCartAddition(productName) {
  if (!cartStatus) return;
  clearTimeout(cartAnnouncementTimer);
  cartStatus.textContent = "";
  if (!mobileCartViewport.matches || mobileCartDialog.open) return;

  // Separar el vaciado permite volver a anunciar un mensaje idéntico; las
  // pulsaciones rápidas se agrupan, sin encolar mensajes ni desplazar el foco.
  cartAnnouncementTimer = setTimeout(() => {
    if (!mobileCartViewport.matches || mobileCartDialog.open) return;
    const count = getCartItemCount();
    cartStatus.textContent = `${productName} añadido. ${count} ${count === 1 ? "producto" : "productos"} en el pedido.`;
  }, 50);
}

// Cambia la cantidad de un producto; si queda en cero, lo elimina.
function updateCartItemQuantity(productId, change) {
  const cartItem = findCartItemById(productId);

  if (!cartItem) {
    return;
  }

  const nextQuantity = cartItem.quantity + change;

  if (nextQuantity <= 0) {
    removeCartItem(productId);
    return;
  }

  if (!Number.isSafeInteger(nextQuantity)) return;
  cartItem.quantity = nextQuantity;
  saveCartToStorage();
  renderCart();
}

// Aumenta en uno la cantidad de un producto del carrito.
function increaseCartItem(productId) {
  updateCartItemQuantity(productId, 1);
}

// Disminuye en uno la cantidad de un producto del carrito.
function decreaseCartItem(productId) {
  updateCartItemQuantity(productId, -1);
}

// Elimina por completo un producto del carrito.
function removeCartItem(productId) {
  const cartItemIndex = cartItems.findIndex((item) => item.id === productId);

  if (cartItemIndex === -1) {
    return;
  }

  cartItems.splice(cartItemIndex, 1);
  saveCartToStorage();
  renderCart();
}

// Suma los subtotales de cada producto del carrito.
function calculateCartSubtotal() {
  return cartItems.reduce((total, item) => total + Math.round(item.price * 100) * item.quantity, 0) / 100;
}

// Revisa que el carrito tenga productos existentes, disponibles y cantidades validas.
function validateCartForOrder() {
  const errors = [];

  if (cartItems.length === 0) {
    errors.push("Agrega al menos un producto al carrito.");
    return errors;
  }

  cartItems.forEach((item) => {
    const product = findProductById(item.id);

    if (!product || !product.disponible) {
      errors.push(`El producto "${item.name}" ya no está disponible.`);
      return;
    }

    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`La cantidad de "${item.name}" no es válida.`);
    }

    if (!Number.isFinite(item.price) || item.price <= 0 ||
        Math.round(item.price * 100) / 100 !== item.price ||
        item.price !== product.precio || item.name !== product.nombre) {
      errors.push(`El precio de "${item.name}" no es válido.`);
    }
  });
  if (!Number.isSafeInteger(Math.round(calculateCartSubtotal() * 100))) {
    errors.push("El total del pedido excede el importe permitido.");
  }

  return errors;
}

// Revisa que los datos minimos del cliente esten completos.
function validateCustomerData(customerData) {
  const errors = [];

  if (!customerData.name) {
    errors.push("Escribe tu nombre para preparar el pedido.");
  }

  const deliveryMode = findDeliveryMode(customerData.deliveryType);
  if (!deliveryMode) {
    errors.push("Selecciona una modalidad de entrega.");
  } else if (deliveryMode.requiresAddress && !customerData.address) {
    errors.push("Escribe la dirección para entrega a domicilio.");
  }

  return errors;
}

// Junta las validaciones del carrito, formulario y configuracion de WhatsApp.
function validateOrder(customerData) {
  if (siteConfig.order.pricesApproved !== true) {
    return [PENDING_PRICES_MESSAGE];
  }

  const errors = [
    ...validateCartForOrder(),
    ...validateCustomerData(customerData),
  ];

  if (!isWhatsAppConfigured()) {
    errors.push("Configura y activa el WhatsApp del negocio antes de enviar pedidos.");
  }

  return errors;
}

function isWhatsAppConfigured() {
  return siteConfig.whatsapp.enabled === true && /^[1-9]\d{7,14}$/.test(RESTAURANT_WHATSAPP_NUMBER);
}

// Construye las lineas de productos que iran en el mensaje de WhatsApp.
function buildProductMessageLines() {
  return cartItems.map((item) => {
    const itemSubtotal = Math.round(item.price * 100) * item.quantity / 100;

    return `- ${item.quantity} x ${item.name} (${formatPrice(item.price)} c/u) = ${formatPrice(itemSubtotal)}`;
  });
}

// Construye el mensaje completo del pedido.
function buildWhatsAppMessage(customerData) {
  const productLines = buildProductMessageLines();
  const total = calculateCartSubtotal();
  const deliveryMode = findDeliveryMode(customerData.deliveryType);
  const messageLines = [
    siteConfig.business.name,
    "",
    "Hola, quiero hacer un pedido.",
    "",
    "Pedido:",
    ...productLines,
    "",
    `Total: ${formatPrice(total)}`,
    "",
    "Datos del cliente:",
    `Nombre: ${customerData.name}`,
    `Entrega: ${deliveryMode.label}`,
  ];

  if (deliveryMode.requiresAddress) {
    messageLines.push(`Dirección: ${customerData.address}`);
  }

  if (customerData.notes) {
    messageLines.push(`Notas: ${customerData.notes}`);
  }

  return messageLines.join("\n");
}

// Codifica el texto para usarlo de forma segura en la URL de WhatsApp.
function createWhatsAppUrl(message) {
  const encodedMessage = encodeURIComponent(message);

  return `${WHATSAPP_BASE_URL}/${RESTAURANT_WHATSAPP_NUMBER}?text=${encodedMessage}`;
}

// Activa el botón cuando el canal y los precios están aprobados y hay productos.
function updateWhatsAppButtonState() {
  if (!whatsappButton) {
    return;
  }

  whatsappButton.disabled = cartItems.length === 0
    || siteConfig.order.pricesApproved !== true || !isWhatsAppConfigured();
}

// Sincroniza contador del header y barra inferior movil con el carrito actual.
function updateOrderIndicators() {
  const itemCount = getCartItemCount();
  const subtotal = calculateCartSubtotal();
  const itemLabel = itemCount === 1 ? "1 producto" : `${itemCount} productos`;

  if (headerCartCountElement) {
    headerCartCountElement.textContent = itemCount;
  }

  if (mobileOrderCountElement) {
    mobileOrderCountElement.textContent = itemLabel;
  }

  if (mobileOrderTotalElement) {
    mobileOrderTotalElement.textContent = formatPrice(subtotal);
  }

  if (mobileOrderBar) {
    mobileOrderBar.hidden = itemCount === 0;
  }
}

// Crea la parte informativa de un producto en el carrito.
function createCartItemInfo(item) {
  const subtotal = item.price * item.quantity;
  const info = document.createElement("div");
  info.className = "cart-item-info";

  const title = document.createElement("h3");
  title.textContent = item.name;

  const unitPrice = document.createElement("p");
  unitPrice.textContent = `Precio unitario: ${formatPrice(item.price)}`;

  const subtotalText = document.createElement("p");
  subtotalText.className = "cart-item-subtotal";
  subtotalText.textContent = `Subtotal: ${formatPrice(subtotal)}`;

  info.append(title, unitPrice, subtotalText);

  return info;
}

// Crea una miniatura del producto para reforzar la lectura visual del pedido.
function createCartItemThumbnail(item) {
  const product = findProductById(item.id);
  const thumbnail = createProductImage(product, { lazy: true });
  thumbnail.className = "cart-item-image";

  return thumbnail;
}

// Crea un boton del carrito con accion y etiqueta accesible.
function createCartActionButton({ action, productId, label, text, className = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.dataset.action = action;
  button.dataset.productId = productId;
  button.setAttribute("aria-label", label);

  if (className) {
    button.className = className;
  }

  return button;
}

// Crea los controles de cantidad para sumar o restar unidades.
function createQuantityControls(item) {
  const quantityControls = document.createElement("div");
  quantityControls.className = "quantity-controls";

  const decreaseButton = createCartActionButton({
    action: "decrease",
    productId: item.id,
    label: `Quitar una unidad de ${item.name}`,
    text: "-",
  });

  const quantity = document.createElement("span");
  quantity.textContent = item.quantity;

  const increaseButton = createCartActionButton({
    action: "increase",
    productId: item.id,
    label: `Agregar una unidad de ${item.name}`,
    text: "+",
  });

  quantityControls.append(decreaseButton, quantity, increaseButton);

  return quantityControls;
}

// Crea el boton para eliminar un producto completo del carrito.
function createRemoveButton(item) {
  return createCartActionButton({
    action: "remove",
    productId: item.id,
    label: `Eliminar ${item.name} del carrito`,
    text: "Eliminar",
    className: "remove-item-button",
  });
}

// Crea el bloque visual de un producto dentro del carrito.
function createCartItemElement(item) {
  const cartItem = document.createElement("article");
  cartItem.className = "cart-item";

  const details = document.createElement("div");
  details.className = "cart-item-details";
  details.append(createCartItemThumbnail(item), createCartItemInfo(item));

  const actions = document.createElement("div");
  actions.className = "cart-item-actions";
  actions.append(createQuantityControls(item), createRemoveButton(item));

  cartItem.append(details, actions);

  return cartItem;
}

// Actualiza el mensaje vacio, la lista de productos y los totales.
function renderCart() {
  if (!cartItemsContainer || !emptyCartMessage || !cartSubtotalElement || !cartTotalElement) {
    return;
  }

  const focusedButton = document.activeElement?.closest("button[data-action]");
  const previousAction = cartItemsContainer.contains(focusedButton) ? focusedButton.dataset : null;
  cartItemsContainer.innerHTML = "";

  if (cartItems.length === 0) {
    emptyCartMessage.classList.remove("is-hidden");
  } else {
    emptyCartMessage.classList.add("is-hidden");
    cartItems.forEach((item) => {
      cartItemsContainer.append(createCartItemElement(item));
    });
  }

  const subtotal = calculateCartSubtotal();
  cartSubtotalElement.textContent = formatPrice(subtotal);
  cartTotalElement.textContent = formatPrice(subtotal);
  updateWhatsAppButtonState();
  updateOrderIndicators();

  if (previousAction) {
    const buttons = [...cartItemsContainer.querySelectorAll("button[data-action]")];
    const replacement = buttons.find(({ dataset }) =>
      dataset.action === previousAction.action && dataset.productId === previousAction.productId
    );
    (replacement ?? buttons[0] ?? (mobileCartDialog.open ? mobileOrderClose : cartPanel)).focus();
  }
}

// Atiende clicks en botones "Agregar" del menu usando delegacion de eventos.
function handleMenuClick(event) {
  const addButton = event.target.closest("button[data-product-id]");

  if (!menuGrid.hasAttribute("data-interactive") || !addButton || !menuGrid.contains(addButton)) {
    return;
  }

  addProductToCart(addButton.dataset.productId);
}

// Atiende clicks en +, - y Eliminar dentro del carrito.
function handleCartClick(event) {
  const actionButton = event.target.closest("button[data-action]");

  if (!actionButton || !cartItemsContainer.contains(actionButton)) {
    return;
  }

  const { action, productId } = actionButton.dataset;

  switch (action) {
    case "increase":
      increaseCartItem(productId);
      break;
    case "decrease":
      decreaseCartItem(productId);
      break;
    case "remove":
      removeCartItem(productId);
      break;
    default:
      break;
  }
}

// Valida el pedido y abre WhatsApp con el mensaje preparado.
function handleWhatsAppClick() {
  const customerData = getCustomerData();
  const errors = validateOrder(customerData);

  clearOrderMessage();

  if (errors.length > 0) {
    showOrderMessage(errors[0]);
    return;
  }

  const message = buildWhatsAppMessage(customerData);
  const whatsappUrl = createWhatsAppUrl(message);

  showOrderMessage("Pedido listo. Se abrirá WhatsApp para confirmar el envío.", "success");
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}

// Abre el panel movil del pedido sin alterar el carrito.
function openMobileOrderPanel(opener) {
  if (!mobileCartViewport.matches || mobileCartDialog.open) return;
  cartOpener = opener;
  mobileCartDialog.append(cartPanel);
  mobileCartDialog.showModal();
  mobileOrderToggle?.setAttribute("aria-expanded", "true");
  mobileOrderClose?.focus();
}

// Cierra el panel movil del pedido conservando productos y formulario.
function closeMobileOrderPanel() {
  if (!mobileCartDialog.open) return;
  mobileCartDialog.close();
  cartHome.append(cartPanel);
  mobileOrderToggle?.setAttribute("aria-expanded", "false");
  const target = cartOpener?.getClientRects().length ? cartOpener : document.querySelector(".header-cart");
  target?.focus({ preventScroll: true });
  cartOpener = null;
}

// Abre el panel movil desde la barra inferior o accesos al pedido.
function handleMobilePanelRequest(event) {
  if (!mobileCartViewport.matches) {
    return;
  }

  event.preventDefault();
  openMobileOrderPanel(event.currentTarget);
}

function keepCartTabInside(event) {
  if (event.key !== "Tab") return;
  const controls = [...mobileCartDialog.querySelectorAll("a[href], button:enabled, input:enabled, select:enabled, textarea:enabled")]
    .filter((control) => control.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  const boundary = event.shiftKey ? first : last;
  if (document.activeElement !== boundary) return;
  event.preventDefault();
  (event.shiftKey ? last : first)?.focus();
}

function syncCartViewport() {
  if (!mobileCartViewport.matches) closeMobileOrderPanel();
  mobilePanelLinks.forEach((link) => {
    if (mobileCartViewport.matches) {
      link.setAttribute("aria-haspopup", "dialog");
    } else {
      link.removeAttribute("aria-haspopup");
    }
  });
}

// Mantiene anclas nativas e historial; el scroll manual solo actualiza el header.
function initializeSiteNavigation() {
  const header = document.querySelector(".site-header");
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const entries = links.map((link) => ({
    link,
    target: document.getElementById(link.hash.slice(1)),
  })).filter(({ target }) => target);
  if (!header || !entries.length) return;

  let active = null;
  let requested = null;
  let anchored = null;
  let anchorTarget = null;
  let frame = 0;
  let settleTimer = 0;
  let forceUpdate = false;
  let homeFrame = 0;

  function markActive(entry) {
    active = entry;
    entries.forEach(({ link }) => {
      const selected = link === entry?.link;
      link.classList.toggle("is-active", selected);
      if (selected) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  function update() {
    frame = 0;
    const force = forceUpdate;
    forceUpdate = false;
    const modalEntry = mobileCartDialog.open
      ? entries.find(({ target }) => mobileCartDialog.contains(target)) : null;
    if (modalEntry || requested) {
      markActive(modalEntry ?? requested);
      return;
    }

    const headerBottom = header.getBoundingClientRect().bottom;
    // Un destino dentro del carrito lateral puede quedar visible sin alcanzar
    // el borde superior del documento, porque tiene su propio scroll.
    if (anchored?.target.closest("aside")) {
      const target = anchorTarget ?? anchored.target;
      const bounds = target.getBoundingClientRect();
      if (target.getClientRects().length && bounds.top >= headerBottom && bounds.top < innerHeight) {
        markActive(anchored);
        return;
      }
    }
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--anchor-gap")) || 0;
    const line = headerBottom + gap;
    const visible = entries.filter(({ target }) => target.getClientRects().length);
    const passed = visible.filter(({ target }) => target.getBoundingClientRect().top <= line + 1);
    const candidate = passed.sort((a, b) =>
      b.target.getBoundingClientRect().top - a.target.getBoundingClientRect().top
    )[0] ?? visible[0];

    // Una banda de 8 px evita alternancias por pequeños movimientos del borde.
    if (!force && active && candidate && candidate !== active) {
      const boundary = active.target.compareDocumentPosition(candidate.target) & Node.DOCUMENT_POSITION_FOLLOWING
        ? candidate.target : active.target;
      if (Math.abs(boundary.getBoundingClientRect().top - line) < 8) return;
    }
    markActive(candidate);
  }

  function schedule(force = false) {
    forceUpdate ||= force;
    if (!frame) frame = requestAnimationFrame(update);
  }

  function finishNavigation() {
    clearTimeout(settleTimer);
    requested = null;
    schedule(true);
  }

  function cancelNavigation() {
    cancelAnimationFrame(homeFrame);
    anchored = null;
    anchorTarget = null;
    finishNavigation();
  }

  function requestDestination(hash) {
    let destination;
    try { destination = document.getElementById(decodeURIComponent(hash.slice(1))); }
    catch { return; }
    if (!destination) {
      if (!hash && mobileCartDialog.open) closeMobileOrderPanel();
      cancelNavigation();
      return;
    }
    if (destination.id === "inicio") {
      // Chrome puede aplicar un frame del scroll anterior después del salto
      // nativo. Reiniciar Inicio tras ese salto evita conservar ese desplazamiento.
      cancelAnimationFrame(homeFrame);
      homeFrame = requestAnimationFrame(() => {
        if (location.hash !== "#inicio") return;
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
        window.scrollTo({ top: 0, behavior });
      });
    }
    // Volver al resumen no debe conservar un título oculto por el scroll interno.
    if (destination === cartPanel) cartPanel.scrollTop = 0;
    if (mobileCartViewport.matches && cartPanel.contains(destination)) {
      openMobileOrderPanel(document.querySelector(".header-cart"));
      schedule(true);
      return;
    }
    if (mobileCartDialog.open) closeMobileOrderPanel();
    requested = entries.find(({ target }) => target === destination)
      ?? entries.find(({ target }) => destination.contains(target))
      ?? entries.find(({ target }) => target.contains(destination));
    if (!requested) return;
    anchored = requested;
    anchorTarget = destination;
    schedule(true);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(finishNavigation, 180);
  }

  function onScroll() {
    schedule();
    if (requested) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finishNavigation, 180);
    }
  }

  function measureHeader() {
    document.documentElement.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
    schedule(true);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    requestDestination(link.hash);
  });
  window.addEventListener("hashchange", () => requestDestination(location.hash));
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", measureHeader, { passive: true });
  window.addEventListener("wheel", cancelNavigation, { passive: true });
  window.addEventListener("touchstart", cancelNavigation, { passive: true });
  window.addEventListener("pointerdown", (event) => {
    if (event.target === document.documentElement) cancelNavigation();
  }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) cancelNavigation();
  });
  new ResizeObserver(measureHeader).observe(header);
  new MutationObserver(() => { requested = null; anchored = null; anchorTarget = null; schedule(true); })
    .observe(mobileCartDialog, { attributes: true, attributeFilter: ["open"] });
  measureHeader();
  if (location.hash) requestDestination(location.hash);
}

// Inicia la interfaz solo si existen los contenedores necesarios.
function initializeApp() {
  if (!menuGrid || !categoryList || !cartItemsContainer || !whatsappButton) {
    return;
  }

  applySiteConfig();
  renderDeliveryOptions();
  document.querySelector(".order-form").addEventListener("submit", (event) => event.preventDefault());
  if (siteConfig.order.pricesApproved !== true) {
    const priceStatus = document.querySelector("#catalog-price-status");
    priceStatus.textContent = PENDING_PRICES_MESSAGE;
    priceStatus.hidden = false;
    showOrderMessage(PENDING_PRICES_MESSAGE);
  } else if (isWhatsAppConfigured()) {
    document.querySelectorAll("[data-order-link]").forEach((link) => {
      link.textContent = "Pedir por WhatsApp";
    });
  }
  renderFeaturedProducts();
  document.querySelector("#featured-grid").addEventListener("keydown", handleFeaturedNavigation);
  restoreCartItems(loadCartFromStorage());
  renderCart();

  menuGrid.addEventListener("click", handleMenuClick);
  categoryList.addEventListener("click", handleCategoryClick);
  categoryList.addEventListener("focusin", (event) => revealCategoryButton(event.target));
  categorySelect.addEventListener("change", () => selectCategory(categorySelect.value));
  cartItemsContainer.addEventListener("click", handleCartClick);
  whatsappButton.addEventListener("click", handleWhatsAppClick);

  if (mobileOrderToggle) {
    mobileOrderToggle.addEventListener("click", handleMobilePanelRequest);
  }

  if (mobileOrderClose) {
    mobileOrderClose.addEventListener("click", closeMobileOrderPanel);
  }

  mobileCartDialog.addEventListener("keydown", keepCartTabInside);
  mobileCartDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMobileOrderPanel();
  });
  mobileCartDialog.addEventListener("click", (event) => {
    if (event.target === mobileCartDialog) closeMobileOrderPanel();
  });
  mobileCartViewport.addEventListener("change", syncCartViewport);
  syncCartViewport();

  mobilePanelLinks.forEach((link) => {
    link.addEventListener("click", handleMobilePanelRequest);
  });

  initializeMenu();
  initializeSiteNavigation();
  whatsappButton.hidden = false;


}


// Vincula contenido variable sin reemplazar la estructura semántica del documento.
function applySiteConfig() {
  document.querySelectorAll("[data-config]").forEach((element) => {
    const value = element.dataset.config.split(".").reduce((value, key) => value?.[key], siteConfig);
    element.textContent = value ?? "";
  });
  // Los metadatos se generan antes del despliegue con npm run seo:sync.
  // Conservar el HTML inicial evita depender de JS o deshacer los textos SEO.
  document.querySelectorAll('.brand img').forEach((image) => {
    image.src = siteConfig.images.logo;
    image.alt = siteConfig.business.name;
  });
  document.querySelector('.brand').setAttribute('aria-label', `Inicio de ${siteConfig.business.shortName}`);
  document.querySelector('.story-card img').src = siteConfig.images.logo;
  document.querySelector('.hero-plate img').src = siteConfig.images.hero;
}

function initializeMenu() {
  const groups = [...menuGrid.querySelectorAll(".menu-category")];
  const index = menuGrid.querySelector(".menu-category-index");
  const picker = categorySelect?.closest(".category-picker");
  if (!index || !picker || !groups.length) return;

  const categories = [...new Set(menuItems.map(product => product.categoria.trim()))];
  if (categories.length !== groups.length) return;
  const cards = [];
  for (const [i, group] of groups.entries()) {
    const category = categories[i];
    const products = menuItems.filter(product => product.categoria.trim() === category && product.disponible);
    const nodes = [...group.querySelectorAll(".menu-card")];
    if (group.dataset.menuCategory !== category || nodes.length !== products.length) return;
    for (const [j, card] of nodes.entries()) {
      const product = products[j];
      const footer = card.querySelector(".dish-footer");
      const price = footer?.querySelector(".price");
      const image = card.querySelector(".dish-image img");
      if (card.dataset.menuProductId !== product.id || !price || !image) return;
      cards.push({ footer, price, image, product });
    }
  }

  categories.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = category;
    button.textContent = category;
    button.setAttribute("aria-controls", "menu-grid");
    categoryList.append(button);
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  });
  for (const { footer, price, image, product } of cards) {
    watchProductImage(image);
    price.textContent = siteConfig.order.pricesApproved === true ? formatPrice(product.precio) : "Precio pendiente";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Agregar";
    button.dataset.productId = product.id;
    button.hidden = true;
    button.setAttribute("aria-label", `Agregar ${product.nombre}`);
    footer.append(button);
  }

  function categoryFromHash() {
    try { return groups.find(group => group.id === decodeURIComponent(location.hash.slice(1))); }
    catch { return undefined; }
  }
  function showHashCategory() {
    const group = categoryFromHash();
    if (!group) return;
    if (group.hidden) selectCategory(group.dataset.menuCategory);
    requestAnimationFrame(() => {
      if (categoryFromHash() === group && !group.hidden) group.scrollIntoView({ behavior: "instant" });
    });
  }

  const initial = categoryFromHash();
  const focusedLink = index.contains(document.activeElement);
  const focusedCategory = document.activeElement?.closest(".menu-category");
  menuGrid.setAttribute("data-interactive", "");
  menuGrid.querySelectorAll(".menu-card button").forEach(button => { button.hidden = false; });
  picker.hidden = false;
  categoryList.hidden = false;
  if (focusedLink) categorySelect.focus({ preventScroll: true });
  index.hidden = true;
  selectCategory(initial?.dataset.menuCategory ?? focusedCategory?.dataset.menuCategory ?? categories[0]);
  window.addEventListener("hashchange", showHashCategory);
  if (initial) showHashCategory();
}

function handleFeaturedNavigation(event) {
  const grid = event.currentTarget;
  if (event.target !== grid || !["ArrowLeft", "ArrowRight"].includes(event.key)
      || grid.scrollWidth <= grid.clientWidth) return;

  const cards = [...grid.children];
  const maxScroll = grid.scrollWidth - grid.clientWidth;
  const positions = [...new Set(cards.map((card) =>
    Math.min(maxScroll, card.offsetLeft - cards[0].offsetLeft)
  ))];
  const current = positions.reduce((nearest, left, index) =>
    Math.abs(left - grid.scrollLeft) < Math.abs(positions[nearest] - grid.scrollLeft) ? index : nearest, 0
  );
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const next = Math.max(0, Math.min(positions.length - 1, current + direction));
  event.preventDefault();
  grid.scrollTo({ left: positions[next] });
}

function renderFeaturedProducts() {
  const grid = document.querySelector('#featured-grid');
  const featured = menuItems.filter((product) => product.destacado === true);
  const products = featured.length ? featured : menuItems;
  grid.replaceChildren();
  products.filter((product) => product.disponible === true).slice(0, 3).forEach((product) => {
    const card = document.createElement('article');
    card.className = 'specialty-card';
    const image = createProductImage(product, { alt: product.nombre });
    image.width = 640;
    image.height = 480;
    const content = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.nombre;
    const description = document.createElement('p');
    description.textContent = product.descripcion;
    const price = document.createElement('strong');
    price.textContent = formatPrice(product.precio);
    content.append(title, description, price);
    card.append(image, content);
    grid.append(card);
  });
}

document.addEventListener("DOMContentLoaded", initializeApp);
