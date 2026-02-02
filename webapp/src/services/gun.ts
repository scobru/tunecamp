import Gun from 'gun';
import 'gun/sea';

// Define Gun peers (should be configurable)
const PEERS = [
    'https://shogun-relay.scobrudot.dev/gun',
    'https://gun.defucc.me/gun',
    'https://gun.o8.is/gun',
    // 'https://tunecamp.scobrudot.dev/gun' // Self
];

// Initialize Gun
const gun = Gun({
    peers: PEERS,
    localStorage: false, // Use Gun's internal storage
    radisk: false
});

const user = gun.user();

// Helper interface for Gun User Profile
export interface GunProfile {
    pub: string;
    alias: string;
    epub: string;
}

export const GunAuth = {
    gun,
    user,

    // Initialize/Recall session
    init: async (): Promise<GunProfile | null> => {
        return new Promise((resolve) => {
            // Attempt to recall session
            user.recall({ sessionStorage: true }, (_ack: any) => {
                if (user.is) {
                    resolve({
                        pub: user.is.pub as string,
                        alias: user.is.alias as string,
                        epub: (user.is as any).epub as string
                    });
                } else {
                    resolve(null);
                }
            });

            // Fallback immediate check
            if (user.is) {
                resolve({
                    pub: user.is.pub as string,
                    alias: user.is.alias as string,
                    epub: (user.is as any).epub as string
                });
            }
        });
    },

    isLoggedIn: () => {
        return !!(user.is && user.is.pub);
    },

    getProfile: (): GunProfile | null => {
        if (!user.is) return null;
        return {
            pub: user.is.pub as string,
            alias: user.is.alias as string,
            epub: (user.is as any).epub as string
        };
    },

    register: (username: string, pass: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            user.create(username, pass, (ack: any) => {
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    // Auto login
                    GunAuth.login(username, pass).then(() => resolve()).catch(reject);
                }
            });
        });
    },

    login: (username: string, pass: string): Promise<GunProfile> => {
        return new Promise((resolve, reject) => {
            user.auth(username, pass, (ack: any) => {
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    resolve({
                        pub: user.is!.pub as string,
                        alias: user.is!.alias as string,
                        epub: (user.is as any).epub as string
                    });
                }
            });
        });
    },

    logout: () => {
        user.leave();
    },

    // Example crypto helpers (signing)
    sign: async (data: any) => {
        if (!user.is) throw new Error("Not logged in");
        // @ts-ignore
        return await Gun.SEA.sign(data, user._.sea);
    },

    verify: async (data: any, pub: string) => {
        return await Gun.SEA.verify(data, pub);
    }
};
