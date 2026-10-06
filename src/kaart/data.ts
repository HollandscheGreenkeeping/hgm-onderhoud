import type { Feature, FeatureCollection, Geometry, Point } from 'geojson'
import { supabase } from '../lib/supabase'
import type { Bron } from './stijl'

export type KaartData = Record<Bron, FeatureCollection> & { centrum: Point | null }

export type Selectie = { soort: 'object' | 'leiding' | 'melding'; id: string }

export async function laadKaart(locatieId: string): Promise<KaartData> {
  const { data, error } = await supabase.rpc('kaart_lagen', { p_locatie: locatieId })
  if (error) throw error
  return data as KaartData
}

export type Grenzen = [[number, number], [number, number]]

// Omhullende rechthoek van alle coördinaten (voor inzoomen op baan of hole).
export function grenzen(features: Feature<Geometry>[]): Grenzen | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const bezoek = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[]
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    } else if (Array.isArray(c)) c.forEach(bezoek)
  }
  for (const f of features) {
    if (f.geometry && 'coordinates' in f.geometry) bezoek(f.geometry.coordinates)
  }
  return minX === Infinity ? null : [[minX, minY], [maxX, maxY]]
}

// PostGIS accepteert EWKT als tekst voor een geometry-kolom.
export const puntEwkt = ([lon, lat]: [number, number]) => `SRID=4326;POINT(${lon} ${lat})`
