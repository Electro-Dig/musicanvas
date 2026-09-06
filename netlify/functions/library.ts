import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { getUser } from '@netlify/identity';

import {
  createLibraryRequestHandler,
  type LibraryBlobStore,
  type VerifiedLibraryUser,
} from './_shared/library.ts';

interface NetlifyLibraryHandlerDependencies {
  getStore(): LibraryBlobStore | Promise<LibraryBlobStore>;
  getUser(): Promise<VerifiedLibraryUser | null>;
}

export function createNetlifyLibraryHandler(dependencies: NetlifyLibraryHandlerDependencies) {
  const handleLibraryRequest = createLibraryRequestHandler({
    getStore: dependencies.getStore,
  });

  return async (
    request: Request,
    context: Pick<Context, 'params'>,
  ): Promise<Response> => {
    const hasBearerToken = /^\s*Bearer\s+/i.test(request.headers.get('authorization') ?? '');
    const verifiedUser = hasBearerToken ? await dependencies.getUser() : null;
    return handleLibraryRequest(request, {
      params: context.params,
      verifiedUser,
    });
  };
}

const handleLibraryRequest = createNetlifyLibraryHandler({
  getStore: () => getStore({
    name: 'gemidi-library',
    consistency: 'strong',
  }) as LibraryBlobStore,
  getUser,
});

export default handleLibraryRequest;

export const config: Config = {
  path: ['/api/library', '/api/library/:id'],
};
