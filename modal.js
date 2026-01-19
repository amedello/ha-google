export function initModal() {
  const modal = document.getElementById("entity-modal");
  const body = document.getElementById("modal-body");
  const title = document.getElementById("modal-title");

  window.openEntityModal = (entity) => {
    title.textContent = entity.entity_id;
    body.innerHTML = "";

    if (entity.type === "light") {
      body.innerHTML = `
        <label>Luminosità</label>
        <input type="range">
        <label>Colore</label>
        <input type="color">
      `;
    }

    if (entity.type === "climate") {
      body.innerHTML = `
        <label>Modalità</label>
        <select>
          <option>Riscaldamento</option>
          <option>Raffrescamento</option>
        </select>
      `;
    }

    modal.classList.remove("hidden");
  };

  document.getElementById("modal-close").onclick = () =>
    modal.classList.add("hidden");
}
