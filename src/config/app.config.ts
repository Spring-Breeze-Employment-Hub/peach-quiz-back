export default (): Record<string, any> => ({
  port: parseInt(process.env.PORT, 10) || 3000,
});
