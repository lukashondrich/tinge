import numpy as np


def _std_normal_cdf(x):
    """Compute the CDF of the standard normal distribution.

    This version avoids the deprecated ``np.erf`` in favor of
    ``np.special.erf`` which remains available in recent versions of
    NumPy. The formula is derived from the relationship between the error
    function and the CDF of the standard normal distribution.

    Parameters
    ----------
    x : array_like
        Values at which to evaluate the CDF.

    Returns
    -------
    array_like
        The CDF evaluated at each value in ``x``.
    """
    return 0.5 * (1.0 + np.special.erf(x / np.sqrt(2.0)))
