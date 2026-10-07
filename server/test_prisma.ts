import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  console.log("Current DB:");
  const current = await prisma.appConfig.findUnique({ where: { id: 1 } });
  console.log(current);
  console.log("Type of autoExecute:", typeof current?.autoExecute);
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
