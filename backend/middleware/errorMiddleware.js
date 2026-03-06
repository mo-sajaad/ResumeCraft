const errorHandler = (err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    details: statusCode === 500 ? err.message : undefined,
  });
};

module.exports = errorHandler;
