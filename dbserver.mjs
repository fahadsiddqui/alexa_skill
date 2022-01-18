import express from "express";
import Alexa, { SkillBuilders } from 'ask-sdk-core';
import morgan from "morgan";
import { ExpressAdapter } from 'ask-sdk-express-adapter';
import mongoose from 'mongoose';
import axios from "axios";

mongoose.connect('mongodb+srv://dbfahad:bharmal786@chatbotalcluster.mpfvc.mongodb.net/mychatapp?retryWrites=true&w=majority',function(){
  console.log("db Connected");
});
  
const Usage = mongoose.model('Usage', {
  skillName: String,
  clientName: String,
  createdOn: { type: Date, default: Date.now },
});

const Order = mongoose.model('Order', {
  userName: String,
  email: String,
  order: String,
  createdOn: { type: Date, default: Date.now },
});

const Cart = mongoose.model('Cart', {
  items: [{
    dishName: String,
    quantity: Number
  }],
  email: String,
  customerName: String,
  createdOn: { type: Date, default: Date.now },
});

const app = express();
app.use(morgan("dev"))
const PORT = process.env.PORT || 3000;


const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speakOutput = 'Fallback intent: Sorry, I had trouble doing what you asked. Please try again.';
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {

    var newUsage = new Usage({
      skillName: "food ordering skill",
      clientName: "Ginsoy Extreme Chinese",
    }).save();

    const speakOutput = 'Welcome to Ginsoy Extreme Chinese, I am your virtual assistant. you can ask for the menu';
    const reprompt = 'I am your virtual assistant. you can ask for the menu';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(reprompt)
      .withSimpleCard("Ginsoy Extreme Chinese", speakOutput)
      .getResponse();
  }
};
const showMenuHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'showMenu';
  },
  handle(handlerInput) {
    const speakOutput = 'In the menu, we have Chinese Chopsuey, Chicken Chowmein, Fried Rice Chicken, Classic Chilli Chicken Dry, Ginsoy Special Chicken and Dragon Chicken. which one would you like to order?';
    const reprompt = 'we have Chinese Chopsuey, Chicken Chowmein, Fried Rice Chicken, Classic Chilli Chicken Dry, Ginsoy Special Chicken, Dragon Chicken.';
    const cardText = '1. Chinese Chopsuey \n2. Chicken Chowmein \n3. Fried Rice Chicken \n4. Classic Chilli Chicken Dry \n5. Ginsoy Special Chicken \n6. Dragon Chicken.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(reprompt)
      .withSimpleCard("Our Menu", cardText)
      .getResponse();
  }
};

const PlaceOrderHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'PlaceOrder';
  },
  async handle(handlerInput) {


    const slots = handlerInput
      .requestEnvelope
      .request
      .intent
      .slots;

    const dishName = slots.dish.value;
    const qty = parseInt(slots.qty.value) | 1;

    console.log("dishName: ", dishName);
    console.log("qty: ", qty);

    if (!dishName) {
      const cardText = '1. Chinese Chopsuey \n2. Chicken Chowmein \n3. Fried Rice Chicken \n4. Classic Chilli Chicken Dry \n5. Ginsoy Special Chicken \n6. Dragon Chicken.';

      return handlerInput.responseBuilder
        .speak(`please tell me dish name. or you can ask for the menu.`)
        .reprompt(`please tell me dish name. or you can ask for the menu.`)
        .withSimpleCard("Our Menu", cardText)
        .getResponse();
    }
    if (!qty) {

      return handlerInput.responseBuilder
        .speak(`how many ${dishName} would you like to order?`)
        .reprompt(`how many ${dishName} would you like to order?`)
        .withSimpleCard("Placing order", `how many ${dishName}?`)
        .getResponse();

    }

    const { serviceClientFactory, responseBuilder } = handlerInput;
    const apiAccessToken = Alexa.getApiAccessToken(handlerInput.requestEnvelope)
     console.log("apiAccessToken: ", apiAccessToken);

    try {
      // https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-customer-contact-information-for-use-in-your-skill.html#get-customer-contact-information

      const responseArray = await Promise.all([
        axios.get("https://api.amazonalexa.com/v2/accounts/~current/settings/Profile.email",
          { headers: { Authorization: `Bearer ${apiAccessToken}` } },
        ),
        axios.get("https://api.amazonalexa.com/v2/accounts/~current/settings/Profile.name",
          { headers: { Authorization: `Bearer ${apiAccessToken}` } },
        ),
      ])

      const email = responseArray[0].data;
      const name = responseArray[1].data;
      console.log("email: ", email);

      if (!email) {
        return handlerInput.responseBuilder
          .speak(`looks like you dont have an email associated with this device, please set your email in Alexa App Settings`)
          .getResponse();
      }

      try {
        let updated = await Cart.findOneAndUpdate(
          { email: email },
          {
            email: email,
            customerName: name,
            $push: {
              items: [{
                dishName: dishName,
                quantity: qty
              }]
            }
          },
          { upsert: true }).exec();

        console.log("added to cart: ", updated);
        return handlerInput.responseBuilder
          .speak(`Dear ${name}, ${qty} ${dishName} is added in your cart, 
               feel free to add more dishes
               or say checkout to complete your order`)
          .getResponse();


      } catch (err) {
        console.log("error in db: ", err);
        return handlerInput.responseBuilder
          .speak(`something went wrong in db operation`)
          .getResponse();
      }

   } catch (error) {
      console.log("error code: ", error.response.status);

      if (error.response.status === 403) {
        return responseBuilder
          .speak('I am Unable to read your email. Please goto Alexa app and then goto Malik Resturant Skill and Grant Profile Permissions to this skill')
          .withAskForPermissionsConsentCard(["alexa::profile:email:read"]) // https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-customer-contact-information-for-use-in-your-skill.html#sample-response-with-permissions-card
          .getResponse();
      }
      return responseBuilder
        .speak('Uh Oh. Looks like something went wrong.')
        .getResponse();
    }
  }
}

const checkOutIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'checkOut';
  },
  async handle(handlerInput) {

    const slots = handlerInput
      .requestEnvelope
      .request
      .intent
      .slots;

    const confirmation = slots.confirmation.value;
    console.log("confirmation: ", confirmation);

    try {
      // https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-customer-contact-information-for-use-in-your-skill.html#get-customer-contact-information

      const { serviceClientFactory, responseBuilder } = handlerInput;
      const apiAccessToken = Alexa.getApiAccessToken(handlerInput.requestEnvelope)
      // console.log("apiAccessToken: ", apiAccessToken);
      const responseArray = await Promise.all([
        axios.get("https://api.amazonalexa.com/v2/accounts/~current/settings/Profile.email",
          { headers: { Authorization: `Bearer ${apiAccessToken}` } },
        ),
        axios.get("https://api.amazonalexa.com/v2/accounts/~current/settings/Profile.name",
          { headers: { Authorization: `Bearer ${apiAccessToken}` } },
        ),
      ])

      const email = responseArray[0].data;
      const name = responseArray[1].data;
      console.log("email: ", email);

      if (!email) {
        return handlerInput.responseBuilder
          .speak(`looks like you dont have an email associated with this device, please set your email in Alexa App Settings`)
          .getResponse();
      }


      try {

        let userCart = await Cart.findOne({ email: email }).exec();
        var orderText = "you have ";
        if (!confirmation) {

          let speech = "you have ";
          let cardText = "";

          userCart.items.map((eachItem, index) => {

            if (index === (userCart.items.length - 1)) { // last item

              speech += `and ${eachItem.quantity} ${eachItem.dishName}. `
              cardText += `${index + 1}. ${eachItem.dishName} x ${eachItem.quantity}\n`

            } else {
              speech += ` ${eachItem.quantity} ${eachItem.dishName}, `
              cardText += `${index + 1}. ${eachItem.dishName} x ${eachItem.quantity}\n`
            }
          })

          speech += "please say yes to confirm."
          cardText += "Are you sure?"

          console.log("order : ", orderText);

          return handlerInput.responseBuilder
            .speak(speech)
            .reprompt(`please say yes or no`)
            .withSimpleCard("Your Cart", cardText)
            .getResponse();


        } else if (confirmation === "yes") {

          userCart.items.map((eachItem, index) => {
            if (index === (userCart.items.length - 1)) { // last item
              orderText += `and ${eachItem.quantity} ${eachItem.dishName}. `
            } else {
              orderText += ` ${eachItem.quantity} ${eachItem.dishName}, `
            }
          })

          orderText += " your order is completed, thank you.";

          let newOrder = new Order({
            userName: userCart.customerName,
            email: userCart.email,
            order: orderText,
          })

          console.log("New Order : ",newOrder);
          let saved = await newOrder.save();

          return handlerInput.responseBuilder
            .speak("your order is completed, thank you.")
            .withSimpleCard("", "Thanks you")
            .getResponse();

        } else {

          return handlerInput.responseBuilder
            .speak("ok cancel. feel free to add more items or say delete cart to start order from scratch.")
            .reprompt("tell me a dish name or you can ask me for the menu")
            .getResponse();

        }

      } catch (e) {
        console.log(e)
      }

    } catch (error) {
      console.log("error code: ", error.response.status);

      if (error.response.status === 403) {
        return responseBuilder
          .speak('I am Unable to read your email. Please goto Alexa app and then goto Malik Resturant Skill and Grant Profile Permissions to this skill')
          .withAskForPermissionsConsentCard(["alexa::profile:email:read"]) // https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-customer-contact-information-for-use-in-your-skill.html#sample-response-with-permissions-card
          .getResponse();
      }
      return responseBuilder
        .speak('Uh Oh. Looks like something went wrong.')
        .getResponse();
    }
  }
}



const skillBuilder = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    showMenuHandler,
    // EmailIntentHandler,
    // deviceIdHandler,
     PlaceOrderHandler,
     checkOutIntentHandler
  )
  .addErrorHandlers(
    ErrorHandler
  )
const skill = skillBuilder.create();
const adapter = new ExpressAdapter(skill, false, false);

app.post('/api/v1/webhook-alexa', adapter.getRequestHandlers());

app.use(express.json())
app.get('/profile', (req, res, next) => {
  res.send("this is a profile");
});

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
