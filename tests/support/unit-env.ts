// Unit tests never touch a real database; these values only satisfy env validation.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit";
process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-unit-test";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
