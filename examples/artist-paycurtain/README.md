# Artist Paycurtain Example

This example demonstrates how to use TuneCamp with the honor system payment model.

## Features Demonstrated

- **Paycurtain Mode**: Honor system where users can download for free but are encouraged to support the artist
- **Payment Links**: PayPal and Stripe integration
- **License System**: Creative Commons licensing
- **Donation Links**: Multiple donation platforms for artist support

## Configuration

### Catalog Configuration
- Basic catalog setup with theme selection

### Artist Configuration
- Artist bio and social links
- Multiple donation platforms (PayPal, Ko-fi, Patreon)

### Release Configuration
- Paycurtain mode with suggested price
- Payment links for PayPal and Stripe
- Creative Commons license (CC BY-NC)
- Genre and credit information

## How It Works

1. **Honor System**: Users can download tracks for free, but the interface encourages support
2. **Payment Links**: Direct links to PayPal and Stripe for easy payment
3. **License Display**: Clear licensing information for each release
4. **Donation Section**: Additional ways to support the artist

## Building the Example

```bash
# Build the example
tunecamp build ./examples/artist-paycurtain --output ./output

# Serve locally
tunecamp serve ./output --port 3000
```

## Key Points

- All files are technically downloadable (static site limitation)
- The paycurtain is more about encouraging support than restricting access
- Multiple payment options give users flexibility
- Clear licensing helps with legal compliance
