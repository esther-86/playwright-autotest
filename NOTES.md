The above, will it work for any site?
Yes for 95% of sites, because all modern browsers automatically turn standard HTML tags (<button>, <a>, <input>) into ARIA roles.

The only time it misses an element is on poorly coded sites where a developer used a plain <div> for a button without giving it a label.

We can add a simple 2-line fallback for those sites so nothing is missed.

===

