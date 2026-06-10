import type { Context } from "@netlify/edge-functions";

/** Returns visitor ISO 3166 country code (e.g. GB, US, RO) from Netlify geo IP data. */
export default async (_request: Request, context: Context) => {
  const countryCode = context.geo?.country?.code ?? null;

  return Response.json(
    { countryCode },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
      },
    },
  );
};

export const config = {
  path: "/api/geo-country",
};
