/**
 * Wires the Users API to the Cloudflare runtime. This is the only file in the API that
 * knows about bindings: everything behind it takes plain values and interfaces.
 */
import { env } from 'cloudflare:workers';

import { UsersApi } from './api';
import { D1UsersRepository } from './d1-repository';
import { UsersService } from './service';

let api: UsersApi | undefined;

export function usersApi(): UsersApi {
  api ??= new UsersApi({
    service: new UsersService(new D1UsersRepository(env.DB)),
    limiters: {
      create: env.CREATE_LIMITER,
      update: env.UPDATE_LIMITER,
      list: env.LIST_LIMITER,
    },
    sessionSecret: env.SESSION_SECRET,
    adminToken: env.ADMIN_TOKEN,
    log: (message, detail) => console.error(JSON.stringify({ message, ...detail })),
  });
  return api;
}
