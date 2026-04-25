export default {
  schema: "./prisma/schema.prisma",
  migrate: {
    connection: {
      url: "file:./dev.db",
    },
  },
}
