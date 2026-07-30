import { ApiError } from './client';
import { authApi } from './auth';
import { catalogApi } from './catalog';
import { socialApi } from './social';
import { adminApi } from './admin';
import { networkApi } from './network';
import { mediaApi } from './media';
import { commerceApi } from './commerce';
import { chatApi } from './chat';

export { ApiError };

const API = {
    ...authApi,
    ...catalogApi,
    ...socialApi,
    ...adminApi,
    ...networkApi,
    ...mediaApi,
    ...commerceApi,
    ...chatApi,
};

export default API;
