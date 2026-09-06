---
name: weather
description: Obtiene el clima actual (y pronóstico opcional) de una ubicación usando APIs públicas sin API key. Úsalo cuando el usuario pida el clima, temperatura, pronóstico o condiciones meteorológicas de su ciudad o de cualquier lugar.
---

# Weather (clima local)

Esta skill obtiene el clima usando APIs públicas gratuitas que no requieren API key, vía `WebFetch`. No hay código que ejecutar: sigue estos pasos con las herramientas disponibles.

## Paso 1: determinar la ubicación

- Si el usuario da una ciudad/lugar explícito, úsalo tal cual.
- Si el usuario dice "mi ubicación", "aquí", "clima local" o no especifica ninguna ciudad, usa **Ciudad de México** por defecto (no preguntes ni asumas GPS/IP; simplemente usa este valor por defecto).

## Paso 2: geocodificar la ubicación (nombre → lat/lon)

Usa la API de geocoding de Open-Meteo (gratuita, sin key):

```
https://geocoding-api.open-meteo.com/v1/search?name=<ciudad>&count=1&language=es&format=json
```

Con `WebFetch`, pide el JSON y extrae `results[0].latitude`, `results[0].longitude`, y `results[0].name`/`country` para confirmar el lugar al usuario.

Si no hay resultados, informa al usuario y pide que aclare el nombre (ej. agregar país o estado).

## Paso 3: obtener el clima actual

Con las coordenadas, llama a la API de pronóstico de Open-Meteo:

```
https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto
```

Usa `WebFetch` para obtener el JSON. Campos relevantes en `current`:

- `temperature_2m` — temperatura actual (°C)
- `apparent_temperature` — sensación térmica
- `relative_humidity_2m` — humedad (%)
- `precipitation` — precipitación (mm)
- `wind_speed_10m` — viento (km/h)
- `weather_code` — código WMO (ver tabla abajo para traducir a descripción)

Por defecto, incluye siempre el pronóstico de los próximos 3 días añadiendo a la URL:

```
&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3
```

Si el usuario pide explícitamente un número distinto de días, ajusta `forecast_days=<N>`.

## Paso 4: traducir el código de clima (weather_code / WMO)

| Código | Descripción |
|---|---|
| 0 | Despejado |
| 1–3 | Parcialmente nublado / nublado |
| 45, 48 | Niebla |
| 51–57 | Llovizna |
| 61–67 | Lluvia |
| 71–77 | Nieve |
| 80–82 | Chubascos |
| 85–86 | Chubascos de nieve |
| 95 | Tormenta eléctrica |
| 96, 99 | Tormenta con granizo |

## Paso 5: responder al usuario

Presenta un resumen breve: ubicación confirmada, temperatura actual, sensación térmica, condición (traducida del código), humedad y viento, seguido del pronóstico de los próximos 3 días (fecha, máxima/mínima y condición por día).

No inventes datos si la API falla o no responde; informa el error al usuario.
