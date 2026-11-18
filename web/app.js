"use strict";

const API = "/api";
const ESPECIE_ICONO = { perro: "🐶", gato: "🐱", ave: "🐦", otro: "🐾" };

const $ = (selector) => document.querySelector(selector);

function hoyEnBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatoFecha(fecha) {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CO", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC"
  });
}

async function pedir(ruta, opciones) {
  const respuesta = await fetch(`${API}${ruta}`, opciones);
  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch { /* respuesta sin JSON */ }
  return { ok: respuesta.ok, status: respuesta.status, cuerpo };
}

function mostrarMensaje(texto, tipo, errores = []) {
  const caja = $("#mensaje");
  caja.replaceChildren();
  caja.className = `mensaje mensaje--${tipo}`;
  const p = document.createElement("p");
  p.textContent = texto;
  caja.append(p);
  if (errores.length) {
    const ul = document.createElement("ul");
    for (const error of errores) {
      const li = document.createElement("li");
      li.textContent = error;
      ul.append(li);
    }
    caja.append(ul);
  }
  caja.hidden = false;
}

async function cargarFranjas() {
  const fecha = $("#fecha").value;
  const select = $("#hora");
  select.replaceChildren();
  select.disabled = true;
  if (!fecha) {
    select.append(new Option("Elige una fecha", ""));
    return;
  }
  select.append(new Option("Cargando…", ""));
  const { ok, cuerpo } = await pedir(`/franjas?fecha=${encodeURIComponent(fecha)}`);
  select.replaceChildren();
  const disponibles = ok ? cuerpo.disponibles : [];
  if (!disponibles.length) {
    select.append(new Option("Sin horas disponibles", ""));
    return;
  }
  for (const hora of disponibles) select.append(new Option(hora, hora));
  select.disabled = false;
}

async function cargarCitas() {
  const fecha = $("#filtro-fecha").value;
  const estado = $("#lista-estado");
  const tabla = $("#tabla-citas");
  const cuerpoTabla = $("#cuerpo-citas");
  const { ok, cuerpo } = await pedir(fecha ? `/citas?fecha=${encodeURIComponent(fecha)}` : "/citas");
  cuerpoTabla.replaceChildren();
  if (!ok) {
    estado.textContent = "No se pudieron cargar las citas.";
    estado.hidden = false;
    tabla.hidden = true;
    return;
  }
  if (!cuerpo.citas.length) {
    estado.textContent = fecha ? "No hay citas para esa fecha." : "Aún no hay citas agendadas.";
    estado.hidden = false;
    tabla.hidden = true;
    return;
  }
  for (const cita of cuerpo.citas) {
    const fila = document.createElement("tr");
    const celdas = [
      formatoFecha(cita.fecha),
      cita.hora,
      `${ESPECIE_ICONO[cita.especie] ?? "🐾"} ${cita.mascotaNombre}`,
      cita.duenoIniciales,
      cita.motivo
    ];
    for (const valor of celdas) {
      const td = document.createElement("td");
      td.textContent = valor;
      fila.append(td);
    }
    cuerpoTabla.append(fila);
  }
  estado.hidden = true;
  tabla.hidden = false;
}

async function agendar(evento) {
  evento.preventDefault();
  const form = evento.target;
  if (!form.reportValidity()) return;
  const datos = Object.fromEntries(new FormData(form));
  datos.aceptaTratamientoDatos = form.aceptaTratamientoDatos.checked;

  const boton = $("#boton-agendar");
  boton.disabled = true;
  boton.textContent = "Agendando…";
  try {
    const { status, cuerpo } = await pedir("/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
    if (status === 201) {
      const c = cuerpo.cita;
      mostrarMensaje(`¡Listo! Cita para ${c.mascotaNombre} el ${formatoFecha(c.fecha)} a las ${c.hora}.`, "exito");
      form.reset();
      await Promise.all([cargarFranjas(), cargarCitas()]);
    } else {
      mostrarMensaje(cuerpo.mensaje ?? "No se pudo agendar la cita.", "error", cuerpo.errores ?? []);
      if (status === 409) await cargarFranjas();
    }
  } catch {
    mostrarMensaje("No hay conexión con el servidor. Intenta de nuevo.", "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Agendar cita";
  }
}

async function cargarVersion() {
  const { ok, cuerpo } = await pedir("/health");
  $("#version").textContent = ok ? `${cuerpo.ambiente} · ${String(cuerpo.version).slice(0, 7)}` : "sin conexión";
}

document.addEventListener("DOMContentLoaded", () => {
  const hoy = hoyEnBogota();
  const fecha = $("#fecha");
  fecha.min = hoy;
  fecha.max = sumarDias(hoy, 60);
  fecha.addEventListener("change", cargarFranjas);
  $("#filtro-fecha").addEventListener("change", cargarCitas);
  $("#form-cita").addEventListener("submit", agendar);
  cargarCitas();
  cargarVersion();
});
