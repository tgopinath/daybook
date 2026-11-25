import { z } from "zod";

const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const memoryFields = {
  title: z.string().trim().min(1, "Give this memory a title").max(200),
  caption: optText(5000),
  date: z.string().min(10).max(40),
  location: optText(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  albumId: z.string().max(40).nullable().optional(),
  favorite: z.boolean().optional(),
  mediaIds: z.array(z.string().max(40)).max(200).optional(),
};

